import { isIP } from "node:net";

const DEFAULT_PATH = "/v1/unijuri/delegated-binding/sign";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024;

function requiredText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function normalizeEndpoint(value, expectedPath) {
  let url;
  try {
    url = new URL(requiredText(value, "endpoint"));
  } catch {
    throw new TypeError("endpoint must be a valid URL");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    isIP(url.hostname) ||
    (url.port && url.port !== "443") ||
    url.pathname !== expectedPath
  ) {
    throw new TypeError("endpoint is not allowed");
  }

  return url.toString();
}

function normalizeCredential(credential) {
  if (!credential || typeof credential !== "object" || Array.isArray(credential)) {
    throw new Error("remote_signer_credential_invalid");
  }
  if (String(credential.scheme ?? "").toLowerCase() !== "bearer") {
    throw new Error("remote_signer_credential_scheme_denied");
  }
  if (!(credential.bytes instanceof Uint8Array) || credential.bytes.byteLength < 16 || credential.bytes.byteLength > 4096) {
    throw new Error("remote_signer_credential_invalid");
  }

  const copy = Buffer.from(credential.bytes);
  const token = copy.toString("utf8").trim();
  copy.fill(0);
  if (!token || /[\r\n\0]/.test(token) || Buffer.byteLength(token) > 4096) {
    throw new Error("remote_signer_credential_invalid");
  }
  return token;
}

async function readBoundedResponse(response) {
  if (typeof response?.arrayBuffer !== "function") {
    throw new Error("remote_signer_response_invalid");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  try {
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      throw new Error("remote_signer_response_too_large");
    }
    return buffer.toString("utf8");
  } finally {
    buffer.fill(0);
  }
}

export function createUniJuriRemoteSignerHttpsTransport({
  endpoint,
  credentialProvider,
  fetchImpl = globalThis.fetch,
  path = DEFAULT_PATH,
  timeoutMs = 2500,
} = {}) {
  if (typeof credentialProvider !== "function") {
    throw new TypeError("credentialProvider must be a function");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10_000) {
    throw new TypeError("timeoutMs must be an integer between 100 and 10000");
  }

  const expectedPath = requiredText(path, "path");
  if (!expectedPath.startsWith("/") || expectedPath.includes("\\") || expectedPath.includes("\0")) {
    throw new TypeError("path is invalid");
  }
  const authorizedEndpoint = normalizeEndpoint(endpoint, expectedPath);

  return Object.freeze({
    mode: "https",
    endpoint: authorizedEndpoint,
    async sign(request = {}) {
      const body = JSON.stringify(request);
      if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
        throw new Error("remote_signer_request_too_large");
      }

      const credential = await credentialProvider({
        purpose: "uni-juri.delegated-binding.remote-signer",
        endpoint: authorizedEndpoint,
      });
      let token = normalizeCredential(credential);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      timeout.unref?.();

      try {
        let response;
        try {
          response = await fetchImpl(authorizedEndpoint, {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
            },
            body,
            redirect: "error",
            cache: "no-store",
            credentials: "omit",
            signal: controller.signal,
          });
        } catch (error) {
          if (error?.name === "AbortError") {
            throw new Error("remote_signer_transport_timeout");
          }
          throw new Error("remote_signer_transport_unavailable");
        }

        if (!Number.isSafeInteger(Number(response?.status))) {
          throw new Error("remote_signer_response_invalid");
        }
        if (response.status >= 300 && response.status <= 399) {
          throw new Error("remote_signer_redirect_denied");
        }
        if (response.status !== 200) {
          throw new Error("remote_signer_http_error");
        }

        const contentType = String(response.headers?.get?.("content-type") ?? "").toLowerCase();
        if (!contentType.startsWith("application/json")) {
          throw new Error("remote_signer_content_type_invalid");
        }

        let parsed;
        try {
          parsed = JSON.parse(await readBoundedResponse(response));
        } catch (error) {
          if (error?.message?.startsWith("remote_signer_")) throw error;
          throw new Error("remote_signer_response_invalid");
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("remote_signer_response_invalid");
        }
        return parsed;
      } finally {
        clearTimeout(timeout);
        token = "";
      }
    },
  });
}

export const UNIJURI_REMOTE_SIGNER_HTTPS_TRANSPORT_CONTRACT = Object.freeze({
  method: "POST",
  path: DEFAULT_PATH,
  scheme: "https",
  credentialPurpose: "uni-juri.delegated-binding.remote-signer",
  redirects: "denied",
  query: "denied",
  literalIpHosts: "denied",
  maxBodyBytes: MAX_BODY_BYTES,
  maxResponseBytes: MAX_RESPONSE_BYTES,
});
