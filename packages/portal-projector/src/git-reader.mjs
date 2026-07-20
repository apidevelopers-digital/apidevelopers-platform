import { createHash } from "node:crypto";

const FULL_SHA = /^[0-9a-f]{40}$/i;

export class PortalGitReaderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PortalGitReaderError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function fail(code, message, details = {}) {
  throw new PortalGitReaderError(code, message, details);
}

function assertFunction(value, name) {
  if (typeof value !== "function") {
    fail("PORTAL_GIT_READER_ADAPTER_INVALID", `${name} must be a function`);
  }
}

function assertPath(path) {
  if (typeof path !== "string" || path.trim() === "") {
    fail("PORTAL_GIT_READER_PATH_INVALID", "path must be a non-empty string");
  }
  if (path.startsWith("/") || path.includes("..") || path.includes("\\") || path.includes("\0")) {
    fail("PORTAL_GIT_READER_PATH_INVALID", "path must be repository-relative and normalized", { path });
  }
}

function sha256Utf8(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function createGitCommitReader({
  repository,
  commit,
  readBlob,
  listTree,
}) {
  if (typeof repository !== "string" || repository.trim() === "") {
    fail("PORTAL_GIT_READER_REPOSITORY_INVALID", "repository must be a non-empty string");
  }
  if (!FULL_SHA.test(commit ?? "")) {
    fail("PORTAL_GIT_READER_COMMIT_INVALID", "commit must be a full 40-character SHA");
  }
  assertFunction(readBlob, "readBlob");
  assertFunction(listTree, "listTree");

  async function readText(path) {
    assertPath(path);
    const result = await readBlob({ repository, commit, path });
    if (!result || typeof result.content !== "string") {
      fail("PORTAL_GIT_READER_BLOB_INVALID", "readBlob must return UTF-8 text content", { path });
    }
    if (result.commit && result.commit !== commit) {
      fail("PORTAL_GIT_READER_MIXED_COMMIT", "adapter returned content from another commit", {
        path,
        expectedCommit: commit,
        observedCommit: result.commit,
      });
    }
    return Object.freeze({
      repository,
      commit,
      path,
      content: result.content,
      checksum: sha256Utf8(result.content),
    });
  }

  async function list(prefix = "") {
    if (prefix !== "") assertPath(prefix);
    const result = await listTree({ repository, commit, prefix });
    if (!Array.isArray(result)) {
      fail("PORTAL_GIT_READER_TREE_INVALID", "listTree must return an array", { prefix });
    }

    const paths = [];
    for (const entry of result) {
      const path = typeof entry === "string" ? entry : entry?.path;
      assertPath(path);
      const entryCommit = typeof entry === "object" && entry ? entry.commit : undefined;
      if (entryCommit && entryCommit !== commit) {
        fail("PORTAL_GIT_READER_MIXED_COMMIT", "tree entry belongs to another commit", {
          path,
          expectedCommit: commit,
          observedCommit: entryCommit,
        });
      }
      if (prefix && path !== prefix && !path.startsWith(`${prefix}/`)) {
        fail("PORTAL_GIT_READER_TREE_INVALID", "tree entry escapes requested prefix", { prefix, path });
      }
      paths.push(path);
    }

    return Object.freeze([...new Set(paths)].sort((a, b) => a.localeCompare(b)));
  }

  async function readMany(paths) {
    if (!Array.isArray(paths)) {
      fail("PORTAL_GIT_READER_PATH_INVALID", "paths must be an array");
    }
    const normalized = [...new Set(paths)];
    for (const path of normalized) assertPath(path);
    const results = await Promise.all(normalized.sort((a, b) => a.localeCompare(b)).map(readText));
    return Object.freeze(results);
  }

  return Object.freeze({
    repository,
    commit,
    readText,
    readMany,
    list,
    mutationAllowed: false,
  });
}
