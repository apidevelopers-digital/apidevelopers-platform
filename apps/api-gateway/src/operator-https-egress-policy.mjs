import { isIP } from "node:net";

const DEFAULT_ALLOWED_HEADERS = Object.freeze([
  "accept",
  "user-agent",
  "x-github-api-version",
]);

const BLOCKED_HEADER_PREFIXES = Object.freeze([
  "proxy-",
  "sec-",
]);

const BLOCKED_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "via",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
]);

export class OperatorHttpsEgressPolicyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OperatorHttpsEgressPolicyError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function fail(code, message, details = {}) {
  throw new OperatorHttpsEgressPolicyError(code, message, details);
}

function normalizeHost(value) {
  const host = String(value ?? "").trim().toLowerCase();
  if (!host || host.endsWith(".") || isIP(host)) {
    fail("egress_host_denied", "egress host is not allowed");
  }
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(host)) {
    fail("egress_host_denied", "egress host is not allowed");
  }
  return host;
}

function normalizeStringSet(values, name, normalizer = (value) => String(value).trim()) {
  if (!Array.isArray(values) || values.length < 1) {
    throw new TypeError(`${name} must be a non-empty array`);
  }
  return new Set(values.map((value) => normalizer(value)));
}

function normalizeHeaders(headers, allowedHeaders) {
  if (headers === undefined) return Object.freeze({});
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    fail("egress_headers_invalid", "request headers must be an object");
  }

  const normalized = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = String(rawName).trim().toLowerCase();
    if (
      !name ||
      BLOCKED_HEADERS.has(name) ||
      BLOCKED_HEADER_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
      !allowedHeaders.has(name)
    ) {
      fail("egress_header_denied", "request header is not allowed", { header: name || "invalid" });
    }

    const value = String(rawValue ?? "").trim();
    if (!value || /[\r\n]/.test(value) || Buffer.byteLength(value) > 1024) {
      fail("egress_header_invalid", "request header value is invalid", { header: name });
    }
    normalized[name] = value;
  }
  return Object.freeze(normalized);
}

function normalizePathPrefixes(values) {
  return normalizeStringSet(values, "allowedPathPrefixes", (value) => {
    const prefix = String(value ?? "").trim();
    if (!prefix.startsWith("/") || prefix.includes("\\") || prefix.includes("\0")) {
      throw new TypeError("allowedPathPrefixes contains an invalid prefix");
    }
    return prefix;
  });
}

export function createOperatorHttpsEgressPolicy({
  allowedHosts = ["api.github.com"],
  allowedMethods = ["GET"],
  allowedPorts = [443],
  allowedPathPrefixes = ["/"],
  allowedQueryKeys = ["page", "per_page", "type"],
  allowedHeaders = DEFAULT_ALLOWED_HEADERS,
} = {}) {
  const hosts = normalizeStringSet(allowedHosts, "allowedHosts", normalizeHost);
  const methods = normalizeStringSet(
    allowedMethods,
    "allowedMethods",
    (value) => String(value ?? "").trim().toUpperCase(),
  );
  const ports = normalizeStringSet(
    allowedPorts,
    "allowedPorts",
    (value) => String(Number(value)),
  );
  const pathPrefixes = normalizePathPrefixes(allowedPathPrefixes);
  const queryKeys = normalizeStringSet(
    allowedQueryKeys,
    "allowedQueryKeys",
    (value) => String(value ?? "").trim(),
  );
  const headerNames = normalizeStringSet(
    allowedHeaders,
    "allowedHeaders",
    (value) => String(value ?? "").trim().toLowerCase(),
  );

  return Object.freeze({
    authorize(request = {}) {
      if (!request || typeof request !== "object" || Array.isArray(request)) {
        fail("egress_request_invalid", "egress request must be an object");
      }

      const method = String(request.method ?? "GET").trim().toUpperCase();
      if (!methods.has(method)) {
        fail("egress_method_denied", "egress method is not allowed", { method });
      }
      if (request.body !== undefined && request.body !== null && request.body !== "") {
        fail("egress_body_denied", "egress request body is not allowed");
      }

      let url;
      try {
        url = new URL(String(request.url ?? ""));
      } catch {
        fail("egress_url_invalid", "egress URL is invalid");
      }

      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.hash ||
        !hosts.has(normalizeHost(url.hostname))
      ) {
        fail("egress_url_denied", "egress URL is not allowed");
      }

      const port = url.port || "443";
      if (!ports.has(port)) {
        fail("egress_port_denied", "egress port is not allowed", { port });
      }

      const decodedPath = decodeURIComponent(url.pathname);
      if (
        decodedPath.includes("\\") ||
        decodedPath.includes("\0") ||
        decodedPath.split("/").includes("..") ||
        ![...pathPrefixes].some((prefix) => decodedPath.startsWith(prefix))
      ) {
        fail("egress_path_denied", "egress path is not allowed");
      }

      for (const key of url.searchParams.keys()) {
        if (!queryKeys.has(key)) {
          fail("egress_query_denied", "egress query key is not allowed", { key });
        }
      }

      const timeoutMs = Number(request.timeoutMs ?? 10_000);
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
        fail("egress_timeout_invalid", "egress timeout is invalid");
      }

      return Object.freeze({
        method,
        url: url.toString(),
        headers: normalizeHeaders(request.headers, headerNames),
        timeoutMs,
      });
    },
  });
}
