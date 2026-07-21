import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeRepositoryPath,
  RepositorySnapshotError,
} from "./repository.mjs";

const DEFAULT_EXCLUDED_DIRECTORIES = Object.freeze([
  ".git",
  "node_modules",
]);

function normalizeRoot(rootPath) {
  if (typeof rootPath !== "string" || rootPath.trim() === "") {
    throw new TypeError("Filesystem repository root must be a non-empty string.");
  }
  return path.resolve(rootPath);
}

function resolveInsideRoot(rootPath, repositoryPath) {
  const normalized = normalizeRepositoryPath(repositoryPath);
  const absolute = path.resolve(rootPath, ...normalized.split("/"));
  const relative = path.relative(rootPath, absolute);

  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    if (relative === "") return { absolute, normalized };
    throw new RepositorySnapshotError(
      "UNSAFE_PATH",
      `Repository path escapes the filesystem root: ${repositoryPath}`,
      { path: repositoryPath },
    );
  }

  return { absolute, normalized };
}

async function walkDirectory(rootPath, relativeDirectory, excludedDirectories, output) {
  const absoluteDirectory = relativeDirectory
    ? path.join(rootPath, ...relativeDirectory.split("/"))
    : rootPath;
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;

    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      if (excludedDirectories.has(entry.name)) continue;
      await walkDirectory(rootPath, relativePath, excludedDirectories, output);
      continue;
    }

    if (entry.isFile()) output.push(normalizeRepositoryPath(relativePath));
  }
}

export function createFilesystemRepository(
  rootPath,
  {
    excludedDirectories = DEFAULT_EXCLUDED_DIRECTORIES,
  } = {},
) {
  const root = normalizeRoot(rootPath);
  const excluded = new Set(excludedDirectories);

  return Object.freeze({
    root,

    async listFiles() {
      const output = [];
      await walkDirectory(root, "", excluded, output);
      return output.sort();
    },

    async exists(repositoryPath) {
      const { absolute } = resolveInsideRoot(root, repositoryPath);
      try {
        const information = await lstat(absolute);
        return information.isFile();
      } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw error;
      }
    },

    async readText(repositoryPath) {
      const { absolute, normalized } = resolveInsideRoot(root, repositoryPath);
      try {
        const information = await lstat(absolute);
        if (!information.isFile() || information.isSymbolicLink()) {
          const error = new RepositorySnapshotError(
            "FILE_NOT_FOUND",
            `Repository file was not found: ${normalized}`,
            { path: normalized },
          );
          error.errno = "ENOENT";
          throw error;
        }
        return await readFile(absolute, "utf8");
      } catch (error) {
        if (error?.code === "ENOENT" || error?.errno === "ENOENT") {
          const wrapped = new RepositorySnapshotError(
            "FILE_NOT_FOUND",
            `Repository file was not found: ${normalized}`,
            { path: normalized },
          );
          wrapped.errno = "ENOENT";
          throw wrapped;
        }
        throw error;
      }
    },
  });
}
