import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const HOSTINGER_API_BASE_URL = "https://developers.hostinger.com";
export const HOSTINGER_MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const SUPPORTED_TRANSPORTS = Object.freeze([
  "multipart",
  "documented-json-filename",
]);

const TERMINAL_STATES = new Set(["completed", "failed"]);
const ALLOWED_APP_TYPES = new Set([
  "create-react-app",
  "vite",
  "angular",
  "react",
  "vue",
  "parcel",
  "express",
  "fastify",
  "nest",
]);
const ALLOWED_PACKAGE_MANAGERS = new Set(["npm", "yarn", "pnpm"]);
const ALLOWED_NODE_VERSIONS = new Set([18, 20, 22, 24]);
const SENSITIVE_KEY_PATTERN =
  /authorization|token|secret|password|archive(?:_data|_base64|_content|_buffer)|private[_-]?key/i;

function required(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
}

function optionalString(name, value, maxLength = 200) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = required(name, value);
  if (normalized.length > maxLength) {
    throw new Error(`too_long:${name}`);
  }
  return normalized;
}

function assertChoice(name, value, allowed) {
  if (!allowed.has(value)) {
    throw new Error(`unsupported:${name}:${value}`);
  }
  return value;
}

function sanitize(value, token) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const withoutToken =
      typeof token === "string" && token.length > 0
        ? value.split(token).join("[REDACTED_TOKEN]")
        : value;
    return withoutToken.length > 20000
      ? `${withoutToken.slice(0, 20000)}...[TRUNCATED]`
      : withoutToken;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, token));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key)
          ? "[REDACTED]"
          : sanitize(item, token),
      ]),
    );
  }
  return value;
}

async function readResponse(response, token) {
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  return sanitize(payload, token);
}

function authHeaders(token, json = false) {
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${required("HOSTINGER_API_TOKEN", token)}`,
    "user-agent": "apidevelopers-platform/site-factory-api-only",
  };
  if (json) headers["content-type"] = "application/json";
  return headers;
}

function buildBasePath({ username, domain }) {
  return `/api/hosting/v1/accounts/${encodeURIComponent(
    required("username", username),
  )}/websites/${encodeURIComponent(required("domain", domain))}/nodejs/builds`;
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function inspectArchive(archivePath) {
  const normalizedPath = required("archivePath", archivePath);
  const stat = await fs.stat(normalizedPath);
  if (!stat.isFile()) throw new Error("archive_not_file");
  if (stat.size <= 0) throw new Error("archive_empty");
  if (stat.size > HOSTINGER_MAX_ARCHIVE_BYTES) {
    throw new Error(`archive_too_large:${stat.size}`);
  }

  const lower = normalizedPath.toLowerCase();
  if (![".zip", ".tgz", ".tar.gz"].some((suffix) => lower.endsWith(suffix))) {
    throw new Error("archive_extension_not_supported");
  }

  const bytes = await fs.readFile(normalizedPath);
  return Object.freeze({
    path: normalizedPath,
    name: path.basename(normalizedPath),
    bytes: stat.size,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    buffer: bytes,
  });
}

export function createSanitizedRequestPreview({
  username,
  domain,
  archive,
  transport = "multipart",
  nodeVersion = 22,
  appType = "vite",
  rootDirectory,
  outputDirectory = "dist",
  buildScript = "build",
  entryFile,
  packageManager = "npm",
  baseUrl = HOSTINGER_API_BASE_URL,
}) {
  assertChoice("transport", transport, new Set(SUPPORTED_TRANSPORTS));
  if (!ALLOWED_NODE_VERSIONS.has(Number(nodeVersion))) {
    throw new Error(`unsupported:nodeVersion:${nodeVersion}`);
  }
  assertChoice("appType", appType, ALLOWED_APP_TYPES);
  assertChoice("packageManager", packageManager, ALLOWED_PACKAGE_MANAGERS);

  const basePath = buildBasePath({ username, domain });
  return Object.freeze({
    method: "POST",
    url: new URL(`${basePath}/from-archive`, baseUrl).toString(),
    transport,
    archive: {
      name: archive.name,
      bytes: archive.bytes,
      sha256: archive.sha256,
      contentIncludedInEvidence: false,
    },
    overrides: {
      node_version: Number(nodeVersion),
      app_type: appType,
      root_directory: optionalString("rootDirectory", rootDirectory),
      output_directory: optionalString("outputDirectory", outputDirectory),
      build_script: optionalString("buildScript", buildScript, 64),
      entry_file: optionalString("entryFile", entryFile),
      package_manager: packageManager,
    },
  });
}

function appendOptional(form, name, value) {
  if (value !== undefined && value !== null && value !== "") {
    form.append(name, String(value));
  }
}

function createMultipartBody(archive, overrides) {
  const form = new FormData();
  form.append(
    "archive",
    new Blob([archive.buffer], { type: "application/zip" }),
    archive.name,
  );
  appendOptional(form, "node_version", overrides.node_version);
  appendOptional(form, "app_type", overrides.app_type);
  appendOptional(form, "root_directory", overrides.root_directory);
  appendOptional(form, "output_directory", overrides.output_directory);
  appendOptional(form, "build_script", overrides.build_script);
  appendOptional(form, "entry_file", overrides.entry_file);
  appendOptional(form, "package_manager", overrides.package_manager);
  return form;
}

function createDocumentedJsonBody(archive, overrides) {
  return JSON.stringify({
    archive: archive.name,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined),
    ),
  });
}

export async function listNodeBuilds({
  token,
  username,
  domain,
  fetchImpl = fetch,
  baseUrl = HOSTINGER_API_BASE_URL,
  timeoutMs = 30000,
  perPage = 100,
}) {
  const url = new URL(buildBasePath({ username, domain }), baseUrl);
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", String(perPage));

  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    { method: "GET", headers: authHeaders(token) },
    timeoutMs,
  );
  const payload = await readResponse(response, token);
  if (!response.ok) {
    const error = new Error(`hostinger_list_builds_failed:${response.status}`);
    error.evidence = {
      operation: "list_builds",
      status: response.status,
      statusText: response.statusText,
      payload,
    };
    throw error;
  }

  const builds = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : [];
  return { status: response.status, builds: sanitize(builds, token) };
}

export async function getNodeBuildLogs({
  token,
  username,
  domain,
  uuid,
  fromLine = 0,
  fetchImpl = fetch,
  baseUrl = HOSTINGER_API_BASE_URL,
  timeoutMs = 30000,
}) {
  const url = new URL(
    `${buildBasePath({ username, domain })}/${encodeURIComponent(
      required("uuid", uuid),
    )}/logs`,
    baseUrl,
  );
  url.searchParams.set("from_line", String(fromLine));

  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    { method: "GET", headers: authHeaders(token) },
    timeoutMs,
  );
  const payload = await readResponse(response, token);
  if (!response.ok) {
    return {
      status: response.status,
      ok: false,
      payload,
    };
  }
  return {
    status: response.status,
    ok: true,
    payload,
  };
}

export async function createNodeBuildFromArchive({
  token,
  username,
  domain,
  archivePath,
  transport = "multipart",
  nodeVersion = 22,
  appType = "vite",
  rootDirectory,
  outputDirectory = "dist",
  buildScript = "build",
  entryFile,
  packageManager = "npm",
  fetchImpl = fetch,
  baseUrl = HOSTINGER_API_BASE_URL,
  timeoutMs = 120000,
}) {
  const archive = await inspectArchive(archivePath);
  const request = createSanitizedRequestPreview({
    username,
    domain,
    archive,
    transport,
    nodeVersion,
    appType,
    rootDirectory,
    outputDirectory,
    buildScript,
    entryFile,
    packageManager,
    baseUrl,
  });

  let body;
  let headers;
  if (transport === "multipart") {
    body = createMultipartBody(archive, request.overrides);
    headers = authHeaders(token);
  } else {
    body = createDocumentedJsonBody(archive, request.overrides);
    headers = authHeaders(token, true);
  }

  const response = await fetchWithTimeout(
    fetchImpl,
    request.url,
    { method: "POST", headers, body },
    timeoutMs,
  );
  const payload = await readResponse(response, token);
  const evidence = {
    operation: "create_build",
    request,
    response: {
      status: response.status,
      statusText: response.statusText,
      payload,
      cloudflareMitigated: response.headers.get("cf-mitigated"),
      correlationId:
        response.headers.get("x-correlation-id") ??
        payload?.correlation_id ??
        payload?.correlationId ??
        null,
    },
  };

  if (!response.ok) {
    const error = new Error(`hostinger_create_build_failed:${response.status}`);
    error.evidence = evidence;
    throw error;
  }

  const uuid = payload?.uuid ?? payload?.data?.uuid;
  if (typeof uuid !== "string" || uuid.trim() === "") {
    const error = new Error("hostinger_create_build_missing_uuid");
    error.evidence = evidence;
    throw error;
  }

  return {
    ...evidence,
    uuid: uuid.trim(),
    state: payload?.state ?? payload?.data?.state ?? "pending",
  };
}

export async function waitForNodeBuild({
  token,
  username,
  domain,
  uuid,
  fetchImpl = fetch,
  baseUrl = HOSTINGER_API_BASE_URL,
  timeoutMs = 30000,
  pollAttempts = 90,
  pollDelayMs = 10000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  let lastBuild = null;
  for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
    const listing = await listNodeBuilds({
      token,
      username,
      domain,
      fetchImpl,
      baseUrl,
      timeoutMs,
    });
    const build = listing.builds.find((item) => item?.uuid === uuid) ?? null;
    if (build) lastBuild = build;
    if (build && TERMINAL_STATES.has(build.state)) {
      const logs = await getNodeBuildLogs({
        token,
        username,
        domain,
        uuid,
        fetchImpl,
        baseUrl,
        timeoutMs,
      });
      return {
        attempt,
        terminal: true,
        build,
        logs,
      };
    }
    if (attempt < pollAttempts) await sleep(pollDelayMs);
  }

  return {
    attempt: pollAttempts,
    terminal: false,
    build: lastBuild,
    logs: null,
  };
}

export async function probePublicSite({
  domain,
  expectedText,
  fetchImpl = fetch,
  attempts = 30,
  delayMs = 10000,
  timeoutMs = 20000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const url = `https://${required("domain", domain)}/`;
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        url,
        {
          method: "GET",
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent": "apidevelopers-platform/site-factory-healthcheck",
          },
          redirect: "follow",
        },
        timeoutMs,
      );
      const body = await response.text();
      const expectedTextMatched =
        !expectedText || body.toLowerCase().includes(expectedText.toLowerCase());
      last = {
        attempt,
        ok: response.ok && expectedTextMatched,
        httpOk: response.ok,
        expectedTextMatched,
        status: response.status,
        finalUrl: response.url,
        contentType: response.headers.get("content-type"),
        bodyBytes: Buffer.byteLength(body),
        bodySha256: crypto.createHash("sha256").update(body).digest("hex"),
      };
      if (last.ok) return last;
    } catch (error) {
      last = {
        attempt,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  return last;
}

export function sanitizeEvidence(value, token) {
  return sanitize(value, token);
}
