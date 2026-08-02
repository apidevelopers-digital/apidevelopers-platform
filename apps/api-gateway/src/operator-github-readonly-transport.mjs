const DEFAULT_ALLOWED_ORIGINS = Object.freeze(["https://api.github.com"]);
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_CREDENTIAL_BYTES = 8 * 1024;
const MAX_TIMEOUT_MS = 60_000;

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

const FORBIDDEN_REQUEST_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "host",
  "content-length",
  "transfer-encoding",
]);

export class OperatorGitHubReadonlyTransportError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "OperatorGitHubReadonlyTransportError";
    this.code = code;
    this.status = status;
  }
}

function positiveInteger(value, field, fallback, maximum) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = Number(value);
  if (
    !Number.isSafeInteger(normalized) ||
    normalized < 1 ||
    normalized > maximum
  ) {
    throw new TypeError(`${field} must be an integer between 1 and ${maximum}`);
  }
  return normalized;
}

function normalizeAllowedOrigins(values) {
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
        url.search ||
        url.hash ||
        url.pathname !== "/"
      ) {
        throw new TypeError(
          "allowedOrigins entries must be HTTPS origins without path, credentials, query or fragment",
        );
      }
      return url.origin;
    }),
  );
}

function normalizeHeaders(value) {
  if (value === undefined) return Object.freeze({});
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OperatorGitHubReadonlyTransportError(
      "invalid_github_transport_request",
      "request headers are invalid",
      400,
    );
  }

  const output = {};
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = String(rawName).trim().toLowerCase();
    if (!name || FORBIDDEN_REQUEST_HEADERS.has(name)) {
      throw new OperatorGitHubReadonlyTransportError(
        "forbidden_github_transport_header",
        "request contains a forbidden header",
        400,
      );
    }

    const normalizedValue = String(rawValue);
    if (/[\r\n\0]/.test(normalizedValue)) {
      throw new OperatorGitHubReadonlyTransportError(
        "invalid_github_transport_request",
        "request header value is invalid",
        400,
      );
    }
    output[name] = normalizedValue;
  }

  return Object.freeze(output);
}

function normalizeRequest(request, allowedOrigins) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new OperatorGitHubReadonlyTransportError(
      "invalid_github_transport_request",
      "request is invalid",
      400,
    );
  }

  if (String(request.method ?? "").toUpperCase() !== "GET") {
    throw new OperatorGitHubReadonlyTransportError(
      "github_transport_method_forbidden",
      "GitHub readonly transport only permits GET",
      405,
    );
  }

  const url = new URL(String(request.url ?? ""));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    !allowedOrigins.includes(url.origin)
  ) {
    throw new OperatorGithubReadonlyTransportError(
      "github_transport_destination_forbidden",
      "GitHub transport destination is not allowed",
      403,
    );
  }

  return Object.freeze({
    method: "GET",
    url: url.toString(),
    headers: normalizeHeaders(request.headers),
    timeoutMs: positiveInteger(
      request.timeoutMs,
      "request.timeoutMs",
      10_000,
      MAX_TIMEOUT_MS,
    ),
  });
}

function normalizeCredential(credential) {
  if (!credential || typeof credential !== "object" || Array.isArray(credential)) {
    throw new OperatorGitHubReadonlyTransportError(
      "invalid_github_transport_credential",
      "credential is invalid",
      500,
    );
  }

  if (String(credential.scheme ?? "").toLowerCase() !== "bearer") {
    throw new OperatorGitHubReadonlyTransportError(
      "invalid_github_transport_credential",
      "credential scheme is invalid",
      500,
    );
  }

  if (!(credential.bytes instanceof Uint8Array)) {
    throw new OperatorGithubReadonlyTransportError(
      "invalid_github_transport_credential",
      "credential bytes are invalid",
      500,
    );
  }

  if (
    credential.bytes.byteLength < 1 ||
    credential.bytes.byteLength > MAX_CREDENTIAL_BYTES
  ) {
    throw new OperatorGitHubReadonlyTransportError(
      "invalid_github_transport_credential",
      "credential size is invalid",
      500,
    );
  }

  return credential.bytes;
}

function credentialText(bytes) {
  const copy = Buffer.from(bytes);
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(copy);
    if (!/^[\x21-\x7e]+$/.test(value)) {
      throw new OperatorGitHubReadonlyTransportError(
        "invalid_github_transport_credential",
        "credential contains invalid bytes",
        500,
      );
    }
    return value;
  } catch (error) {
    if (error instanceof OperatorGitHubReadonlyTransportError) throw error;
    throw new OperatorGithubReadonlyTransportError(
      "invalid_github_transport_credential",
      "credential encoding is invalid",
      500,
   );
  } finally {
    copy.fill(0);
  }
}

function headerValue(headers, name) {
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

function sanitizeResponseHeaders(headers) {
  const output = {};
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = headerValue(headers, name);
    if (value !== undefined && !/[\r\n\0]/.test(value)) output[name] = value;
  }
  return Object.freeze(output);
}

async function readBoundedBody(response, maximum) {
  const declaredLength = Number(headerValue(response.headers, "content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength >= 0 &&
    declaredLength > maximum
  ) {
    throw new OperatorGitHubReadonlyTransportError(
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
          throw new OperatorGitHubReadonlyTransportError(
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
    throw new OperatorGithubReadonlyTransportError(
      "github_transport_contract_violation",
      "GitHub transport received an invalid response body",
      502,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  try {
    if (bytes.byteLength > maximum) {
      throw new OperatorGitHubReadonlyTransportError(
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
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }

  const resolvedOrigins = normalizeAllowedOrigins(allowedOrigins);
  const resolvedMaximum = positiveInteger(
    maxResponseBytes,
    "maxResponseBytes",
    DEFAULT_MAX_RESPONSE_BYTES,
    MAX_RESPONSE_BYTES,
  );

  return Object.freeze({
    descriptor: Object.freeze({
      mode: "readonly",
      allowedOrigins: resolvedOrigins,
      maxResponseBytes: resolvedMaximum,
      credentialMaterialPersisted: false,
      rawResponseHeadersReturned: false,
      productionChanged: false,
    }),

    async requestWithCredential({ request, credential } = {}) {
      const resolvedRequest = normalizeRequest(request, resolvedOrigins);
      const bytes = normalizeCredential(credential);
      const token = credentialText(bytes);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), resolvedRequest.timeoutMs);

      let response;
      try {
        response = await fetchImpl(resolvedRequest.url, {
          method: "GET",
          headers: {
            ...resolvedRequest.headers,
            authorization: `Bearer ${token}`,
          },
          redirect: "error",
          signal: controller.signal,
        });
      } catch {
        throw new OperatorGitHubReadonlyTransportError(
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
        throw new OperatorGitHubReadonlyTransportError(
          "github_transport_contract_violation",
          "GitHub transport received an invalid response",
          502,
        );
      }

      return Object.freeze({
        status: Number(response.status),
        headers: sanitizeResponseHeaders(response.headers),
        body: await readBoundedBody(response, resolvedMaximum),
      });
    },
  });
}
