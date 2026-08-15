const DEFAULT_ORIGINS = Object.freeze(["https://api.github.com"]);
const SAFE_RESPONSE_HEADERS = Object.freeze([
  "content-type",
  "link",
  "retry-after",
  "x-github-request-id",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-ratelimit-resource",
  "x-ratelimit-used",
]);
const FORBIDDEN_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "host",
  "content-length",
  "transfer-encoding",
]);
const MAX_CREDENTIAL_BYTES = 8 * 1024;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_TIMEOUT_MS = 60_000;

export class OperatorGitHubReadonlyTransportError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "OperatorGitHubReadonlyTransportError";
    this.code = code;
    this.status = status;
  }
}

function boundedInteger(value, fallback, maximum, field) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new TypeError(`${field} must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}

function normalizeOrigins(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("allowedOrigins must be a non-empty array");
  }
  return Object.freeze(
    values.map((value) => {
      const url = new URL(String(value));
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        throw new TypeError("allowedOrigins entries must be plain HTTPS origins");
      }
      return url.origin;
    }),
  );
}

function transportError(code, message, status) {
  return new OperatorGitHubReadonlyTransportError(code, message, status);
}

function normalizeHeaders(headers) {
  if (headers === undefined) return Object.freeze({});
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    throw transportError(
      "invalid_github_transport_request",
      "request headers are invalid",
      400,
    );
  }

  const output = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = String(rawName).trim().toLowerCase();
    const value = String(rawValue);
    if (!name || FORBIDDEN_HEADERS.has(name)) {
      throw transportError(
        "forbidden_github_transport_header",
        "request contains a forbidden header",
        400,
      );
    }
    if (/[\r\n\0]/.test(value)) {
      throw transportError(
        "invalid_github_transport_request",
        "request header value is invalid",
        400,
      );
    }
    output[name] = value;
  }
  return Object.freeze(output);
}

function normalizeRequest(request, origins) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw transportError(
      "invalid_github_transport_request",
      "request is invalid",
      400,
    );
  }
  if (String(request.method ?? "").toUpperCase() !== "GET") {
    throw transportError(
      "github_transport_method_forbidden",
      "GitHub readonly transport only permits GET",
      405,
    );
  }

  let url;
  try {
    url = new URL(String(request.url ?? ""));
  } catch {
    throw transportError(
      "github_transport_destination_forbidden",
      "GitHub transport destination is not allowed",
      403,
    );
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    !origins.includes(url.origin)
  ) {
    throw transportError(
      "github_transport_destination_forbidden",
      "GitHub transport destination is not allowed",
      403,
    );
  }

  return Object.freeze({
    url: url.toString(),
    headers: normalizeHeaders(request.headers),
    timeoutMs: boundedInteger(
      request.timeoutMs,
      10_000,
      MAX_TIMEOUT_MS,
      "request.timeoutMs",
    ),
  });
}

function credentialText(credential) {
  if (
    !credential ||
    typeof credential !== "object" ||
    Array.isArray(credential) ||
    String(credential.scheme ?? "").toLowerCase() !== "bearer" ||
    !(credential.bytes instanceof Uint8Array) ||
    credential.bytes.byteLength < 1 ||
    credential.bytes.byteLength > MAX_CREDENTIAL_BYTES
  ) {
    throw transportError(
      "invalid_github_transport_credential",
      "credential is invalid",
      500,
    );
  }

  const copy = Buffer.from(credential.bytes);
  try {
    const token = new TextDecoder("utf-8", { fatal: true }).decode(copy);
    if (!/^[\x21-\x7e]+$/.test(token)) {
      throw transportError(
        "invalid_github_transport_credential",
        "credential contains invalid bytes",
        500,
      );
    }
    return token;
  } catch (error) {
    if (error instanceof OperatorGitHubReadonlyTransportError) throw error;
    throw transportError(
      "invalid_github_transport_credential",
      "credential encoding is invalid",
      500,
    );
  } finally {
    copy.fill(0);
  }
}

function getHeader(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === "function") {
    const value = headers.get(name);
    return value === null ? undefined : String(value);
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) return String(value);
  }
  return undefined;
}

function safeHeaders(headers) {
  const output = {};
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = getHeader(headers, name);
    if (value !== undefined && !/[\r\n\0]/.test(value)) output[name] = value;
  }
  return Object.freeze(output);
}

async function boundedBody(response, maximum) {
  const declared = Number(getHeader(response.headers, "content-length"));
  if (Number.isFinite(declared) && declared >= 0 && declared > maximum) {
    throw transportError(
      "github_transport_response_too_large",
      "GitHub response exceeded the allowed size",
      502,
    );
  }

  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.byteLength;
        if (total > maximum) {
          await reader.cancel();
          throw transportError(
            "github_transport_response_too_large",
            "GitHub response exceeded the allowed size",
            502,
          );
        }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks, total).toString("utf8");
    } finally {
      for (const chunk of chunks) chunk.fill(0);
    }
  }

  if (typeof response.arrayBuffer !== "function") {
    throw transportError(
      "github_transport_contract_violation",
      "GitHub transport received an invalid response body",
      502,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  try {
    if (bytes.byteLength > maximum) {
      throw transportError(
        "github_transport_response_too_large",
        "GitHub response exceeded the allowed size",
        502,
      );
    }
    return bytes.toString("utf8");
  } finally {
    bytes.fill(0);
  }
}

export function createOperatorGitHubReadonlyTransport({
  fetchImpl = globalThis.fetch,
  allowedOrigins = DEFAULT_ORIGINS,
  maxResponseBytes = 1024 * 1024,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }

  const origins = normalizeOrigins(allowedOrigins);
  const maximum = boundedInteger(
    maxResponseBytes,
    1024 * 1024,
    MAX_RESPONSE_BYTES,
    "maxResponseBytes",
  );

  return Object.freeze({
    descriptor: Object.freeze({
      mode: "readonly",
      allowedOrigins: origins,
      maxResponseBytes: maximum,
      credentialMaterialPersisted: false,
      rawResponseHeadersReturned: false,
      productionChanged: false,
    }),

    async requestWithCredential({ request, credential } = {}) {
      const normalized = normalizeRequest(request, origins);
      const token = credentialText(credential);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), normalized.timeoutMs);

      let response;
      try {
        response = await fetchImpl(normalized.url, {
          method: "GET",
          headers: {
            ...normalized.headers,
            authorization: `Bearer ${token}`,
          },
          redirect: "error",
          signal: controller.signal,
        });
      } catch {
        throw transportError(
          "github_transport_unavailable",
          "GitHub transport is unavailable",
          503,
        );
      } finally {
        clearTimeout(timer);
      }

      if (
        !response ||
        typeof response !== "object" ||
        !Number.isSafeInteger(Number(response.status))
      ) {
        throw transportError(
          "github_transport_contract_violation",
          "GitHub transport received an invalid response",
          502,
        );
      }

      return Object.freeze({
        status: Number(response.status),
        headers: safeHeaders(response.headers),
        body: await boundedBody(response, maximum),
      });
    },
  });
}
