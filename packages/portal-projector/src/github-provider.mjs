import { createGitCommitReader } from "./git-reader.mjs";

const FULL_SHA = /^[0-9a-f]{40}$/i;
const REPOSITORY = /^[^/\s]+\/[^/\s]+$/;

export class PortalGitHubProviderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PortalGitHubProviderError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function fail(code, message, details = {}) {
  throw new PortalGitHubProviderError(code, message, details);
}

function assertFunction(value, name) {
  if (typeof value !== "function") {
    fail("PORTAL_GITHUB_PROVIDER_ADAPTER_INVALID", `${name} must be a function`);
  }
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function decodeBase64Utf8(content) {
  if (typeof content !== "string") {
    fail("PORTAL_GITHUB_PROVIDER_CONTENT_INVALID", "GitHub content must be base64 text");
  }

  try {
    return Buffer.from(content.replace(/\s+/g, ""), "base64").toString("utf8");
  } catch (error) {
    fail("PORTAL_GITHUB_PROVIDER_CONTENT_INVALID", "GitHub content could not be decoded", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeResponse(response, operation) {
  if (!response || typeof response !== "object") {
    fail("PORTAL_GITHUB_PROVIDER_RESPONSE_INVALID", `${operation} must return an object`);
  }

  const status = Number(response.status ?? 200);
  if (!Number.isInteger(status)) {
    fail("PORTAL_GITHUB_PROVIDER_RESPONSE_INVALID", `${operation} returned invalid status`);
  }

  if (status < 200 || status >= 300) {
    fail("PORTAL_GITHUB_PROVIDER_REQUEST_FAILED", `${operation} failed`, {
      status,
      operation,
    });
  }

  return Object.hasOwn(response, "data") ? response.data : response;
}

function normalizeTree(tree, commit, prefix) {
  if (!Array.isArray(tree)) {
    fail("PORTAL_GITHUB_PROVIDER_TREE_INVALID", "GitHub tree must be an array");
  }

  const paths = [];
  for (const entry of tree) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.type !== "blob") continue;

    if (typeof entry.path !== "string" || entry.path.length === 0) {
      fail("PORTAL_GITHUB_PROVIDER_TREE_INVALID", "GitHub tree entry must expose path");
    }

    if (prefix && entry.path !== prefix && !entry.path.startsWith(`${prefix}/`)) continue;
    paths.push({ path: entry.path, commit });
  }

  return paths;
}

export function createGitHubReadOnlyPorts({
  request,
  apiBaseUrl = "https://api.github.com",
  apiVersion = "2022-11-28",
} = {}) {
  assertFunction(request, "request");
  const baseUrl = apiBaseUrl.replace(/\/+$/, "");

  async function readBlob({ repository, commit, path }) {
    const url = `${baseUrl}/repos/${repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(commit)}`;
    const response = normalizeResponse(
      await request({
        method: "GET",
        url,
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": apiVersion,
        },
        operation: "readBlob",
      }),
      "readBlob",
    );

    if (!response || typeof response !== "object" || response.type === "dir") {
      fail(
        "PORTAL_GITHUB_PROVIDER_CONTENT_INVALID",
        "GitHub content response must describe one file",
        { path },
      );
    }

    if (response.encoding !== "base64") {
      fail(
        "PORTAL_GITHUB_PROVIDER_CONTENT_INVALID",
        "GitHub content encoding must be base64",
        { path, encoding: response.encoding },
      );
    }

    return Object.freeze({
      content: decodeBase64Utf8(response.content),
      commit,
    });
  }

  async function listTree({ repository, commit, prefix = "" }) {
    const url = `${baseUrl}/repos/${repository}/git/trees/${encodeURIComponent(commit)}?recursive=1`;
    const response = normalizeResponse(
      await request({
        method: "GET",
        url,
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": apiVersion,
        },
        operation: "listTree",
      }),
      "listTree",
    );

    if (response?.truncated === true) {
      fail(
        "PORTAL_GITHUB_PROVIDER_TREE_TRUNCATED",
        "GitHub returned a truncated recursive tree",
        { repository, commit },
      );
    }

    return normalizeTree(response?.tree, commit, prefix);
  }

  return Object.freeze({
    readBlob,
    listTree,
    mutationAllowed: false,
  });
}

export function createGitHubCommitReader({
  repository,
  commit,
  request,
  apiBaseUrl,
  apiVersion,
} = {}) {
  if (typeof repository !== "string" || !REPOSITORY.test(repository)) {
    fail(
      "PORTAL_GITHUB_PROVIDER_REPOSITORY_INVALID",
      "repository must use owner/name format",
    );
  }

  if (!FULL_SHA.test(commit ?? "")) {
    fail(
      "PORTAL_GITHUB_PROVIDER_COMMIT_INVALID",
      "commit must be a full 40-character SHA",
    );
  }

  const ports = createGitHubReadOnlyPorts({
    request,
    apiBaseUrl,
    apiVersion,
  });

  return createGitCommitReader({
    repository,
    commit,
    readBlob: ports.readBlob,
    listTree: ports.listTree,
  });
}
