import path from "node:path";

const ALLOWED_SCOPE_MODES = Object.freeze([
  "repository",
  "changed-files",
  "paths",
]);

export class RepositorySnapshotError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RepositorySnapshotError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

export function normalizeRepositoryPath(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RepositorySnapshotError("INVALID_PATH", "Repository path must be a non-empty string.");
  }

  const unix = value.replaceAll("\\", "/").replace(/^\.\/+/, "");
  const normalized = path.posix.normalize(unix);

  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new RepositorySnapshotError(
      "UNSAFE_PATH",
      `Repository path escapes the workspace: ${value}`,
      { path: value },
    );
  }

  return normalized;
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function globToRegExp(pattern) {
  const normalized = normalizeRepositoryPath(pattern);
  let source = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (character === "*") {
      if (normalized[index + 1] === "*") {
        const followedBySlash = normalized[index + 2] === "/";
        source += followedBySlash ? "(?:.*/)?" : ".*";
        index += followedBySlash ? 2 : 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }

    source += escapeRegex(character);
  }

  return new RegExp(`^${source}$`, "u");
}

export function matchesPatterns(filePath, include = ["**"], exclude = []) {
  const normalized = normalizeRepositoryPath(filePath);
  const included = include.length === 0 || include.some((pattern) => globToRegExp(pattern).test(normalized));
  const excluded = exclude.some((pattern) => globToRegExp(pattern).test(normalized));
  return included && !excluded;
}

export function createMemoryRepository(entries = []) {
  const normalizedEntries = Array.isArray(entries)
    ? entries
    : Object.entries(entries).map(([filePath, content]) => ({ path: filePath, content }));

  const files = new Map();

  for (const entry of normalizedEntries) {
    const filePath = normalizeRepositoryPath(entry?.path);
    if (files.has(filePath)) {
      throw new RepositorySnapshotError(
        "DUPLICATE_PATH",
        `Duplicate repository path: ${filePath}`,
        { path: filePath },
      );
    }

    if (typeof entry?.content !== "string") {
      throw new RepositorySnapshotError(
        "INVALID_CONTENT",
        `Repository content must be text: ${filePath}`,
        { path: filePath },
      );
    }

    files.set(filePath, entry.content);
  }

  const sortedPaths = Object.freeze([...files.keys()].sort());

  return Object.freeze({
    async listFiles() {
      return [...sortedPaths];
    },

    async exists(filePath) {
      return files.has(normalizeRepositoryPath(filePath));
    },

    async readText(filePath) {
      const normalized = normalizeRepositoryPath(filePath);
      if (!files.has(normalized)) {
        const error = new RepositorySnapshotError(
          "FILE_NOT_FOUND",
          `Repository file was not found: ${normalized}`,
          { path: normalized },
        );
        error.errno = "ENOENT";
        throw error;
      }
      return files.get(normalized);
    },

    manifest() {
      return sortedPaths.map((filePath) => ({
        path: filePath,
        bytes: Buffer.byteLength(files.get(filePath), "utf8"),
      }));
    },
  });
}

export async function resolveScope(
  scope,
  {
    listFiles,
    changedFiles = [],
  } = {},
) {
  if (typeof listFiles !== "function") {
    throw new RepositorySnapshotError("LIST_FILES_REQUIRED", "resolveScope requires listFiles().");
  }

  const mode = scope?.mode ?? "repository";
  if (!ALLOWED_SCOPE_MODES.includes(mode)) {
    throw new RepositorySnapshotError(
      "UNSUPPORTED_SCOPE_MODE",
      `Unsupported scope mode: ${mode}`,
      { mode },
    );
  }

  const allFiles = (await listFiles()).map(normalizeRepositoryPath);
  let candidates;

  if (mode === "repository") {
    candidates = allFiles;
  } else if (mode === "changed-files") {
    if (!scope?.baseSha || !scope?.headSha) {
      throw new RepositorySnapshotError(
        "REVISION_RANGE_REQUIRED",
        "changed-files scope requires baseSha and headSha.",
      );
    }
    candidates = changedFiles.map(normalizeRepositoryPath);
  } else {
    if (!Array.isArray(scope?.paths) || scope.paths.length === 0) {
      throw new RepositorySnapshotError("PATHS_REQUIRED", "paths scope requires a non-empty paths array.");
    }
    candidates = scope.paths.map(normalizeRepositoryPath);
  }

  const available = new Set(allFiles);
  const include = Array.isArray(scope?.include) ? scope.include : ["**"];
  const exclude = Array.isArray(scope?.exclude) ? scope.exclude : [];

  return Object.freeze(
    [...new Set(candidates)]
      .filter((filePath) => available.has(filePath))
      .filter((filePath) => matchesPatterns(filePath, include, exclude))
      .sort(),
  );
}
