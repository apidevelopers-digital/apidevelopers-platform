import {
  OperatorHttpsEgressPolicyError,
  createOperatorHttpsEgressPolicy,
} from "./operator-https-egress-policy.mjs";

const MAX_CREDENTIAL_BYTES = 8192;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const RESPONSE_HEADERS = Object.freeze([
  "content-type",
  "link",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
]);

export class OperatorHttpsCredentialTransportError extends Error {
  constructor(code, message, status = 503, details = {}) {
    super(message);
    this.name = "OperatorHttpsCredentialTransportError";
    this.code = code;
    this.status = status;
    this.details = Object.freeze({ ...details });
  }
}

function fail(code, message, status = 503, details = {}) {
  throw new OperatorHttpsCredentialTransportError(code, message, status, details);
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }
  return fetchImpl;
}

function normalizeCredential(credential) {
  if (!credential || typeof credential !== "object" || Array.isArray(credential)) {
    fail("credential_invalid", "credential contract is invalid", 500);
  }
  if (String(credential.scheme ?? "").toLowerCase() !== "bearer") {
    fail("credential_scheme_denied", "credential scheme is not allowed", 500);
  }
  if (!(credential.bytes instanceof Uint8Array)) {
    fail("credential_invalid", "credential bytes are invalid", 500);
  }
  if (
    credential.bytes.byteLength < 1 ||
    credential.bytes.byteLength > MAX_CREDENTIAL_BYTES
  ) {
    fail("credential_invalid", "credential length is invalid", 500);
  }

  const bytes = Buffer.from(credential.bytes);
  const token = bytes.toString("utf8").trim();
  bytes.fill(0);

  if (
    !token ||
    /[\r\n\0]/.test(token) ||
    Buffer.byteLength(token) > MAX_CREDENTIAL_BYTES
  ) {
    fail("credential_invalid", "credential value is invalid", 500);
  }
  return token;
}

function responseHeaderEntries(headers) {
  if (!headers) return [];
  if (typeof headers.entries === "function") return [...headers.entries()];
  if (typeof headers === "object" && !Array.isArray(headers)) {
    return Object.entries(headers);
  }
  return [];
}

function sanitizeResponseHeaders(headers) {
  const allowed = new Set(RESPONSE_HEADERS);
  const result = {};

  for (const [rawName, rawValue] of responseHeaderEntries(headers)) {
    const name = String(rawName).toLowerCase();
    if (!allowed.has(name)) continue;

    const value = String(rawValue ?? "").trim();
    if (!value || /[\r\n]/.test(value) || Buffer.byteLength(value) > 4096) {
      continue;
    }
    result[name] = value;
  }

  return Object.freeze(result);
}

async function readBoundedResponseBody(response, maxResponseBytes) {
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength >= 0 &&
    declaredLength > maxResponseBytes
  ) {
    fail(
      "response_too_large",
      "upstream response exceeded the allowed size",
      502,
    );
  }

  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let combined;
    let total = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = Buffer.from(value);
        total += chunk.byteLength;
        if (total > maxResponseBytes) {
          chunk.fill(0);
          await reader.cancel().catch(() => {});
          fail(
            "response_too_large",
            "upstream response exceeded the allowed size",
            502,
          );
        }
        chunks.push(chunk);
      }

      combined = Buffer.concat(chunks);
      return combined.toString("utf8");
    } finally {
      combined?.fill(0);
      for (const chunk of chunks) chunk.fill(0);
      reader.releaseLock?.();
    }
  }

  if (typeof response.arrayBuffer !== "function") {
    fail("response_invalid", "upstream response body is unavailable", 502);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxResponseBytes) {
    buffer.fill(0);
    fail(
      "response_too_large",
      "upstream response exceeded the allowed size",
      502,
    );
  }

  const text = buffer.toString("utf8");
  buffer.fill(0);
  return text;
}

export function createUnavailableOperatorHttpsCredentialTransport() {
  return Object.freeze({
    async requestWithCredential() {
      fail(
        "https_transport_unavailable",
        "HTTPS transport is unavailable",
        503,
      );
    },
  });
}

export function createOperatorHttpsCredentialTransport({
  fetchImpl,
  policy = createOperatorHttpsEgressPolicy(),
  maxResponseBytes = MAX_RESPONSE_BYTES,
} = {}) {
  const resolvedFetch = requireFetch(fetchImpl);

  if (typeof policy?.authorize !== "function") {
    throw new TypeError("policy.authorize must be a function");
  }
  if (
    !Number.isSafeInteger(maxResponseBytes) ||
    maxResponseBytes < 1024 ||
    maxResponseBytes > MAX_RESPONSE_BYTES
  ) {
    throw new TypeError(
      "maxResponseBytes must be an integer between 1024 and 1048576",
    );
  }

  return Object.freeze({
    async requestWithCredential({ request, credential } = {}) {
      let authorized;
      try {
        authorized = policy.authorize(request);
      } catch (error) {
        if (error instanceof OperatorHttpsEgressPolicyError) {
          throw new OperatorHttpsCredentialTransportError(
            error.code,
            error.message,
            403,
            error.details,
          );
        }
        throw error;
      }

      let token = normalizeCredential(credential);
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        authorized.timeoutMs,
      );
      timeout.unref?.();

      try {
        let response;
        try {
          response = await resolvedFetch(authorized.url, {
            method: authorized.method,
            headers: {
              ...authorized.headers,
              authorization: `Bearer ${token}`,
            },
            body: undefined,
            redirect: "error",
            cache: "no-store",
            credentials: "omit",
            signal: controller.signal,
          });
        } catch (error) {
          if (error?.name === "AbortError") {
            fail(
              "https_transport_timeout",
              "HTTPS request timed out",
              504,
            );
          }
          fail(
            "https_transport_unavailable",
            "HTTPS transport is unavailable",
            503,
          );
        }

        const status = Number(response?.status);
        if (
          !Number.isSafeInteger(status) ||
          status < 100 ||
          status > 599
        ) {
          fail(
            "response_invalid",
            "upstream response status is invalid",
            502,
          );
        }
        if (status >= 300 && status <= 399) {
          fail(
            "redirect_denied",
            "upstream redirect is not allowed",
            502,
          );
        }

        return Object.freeze({
          status,
          headers: sanitizeResponseHeaders(response.headers),
          body: await readBoundedResponseBody(
            response,
            maxResponseBytes,
          ),
        });
      } finally {
        clearTimeout(timeout);
        token = "";
      }
    },
  });
}
