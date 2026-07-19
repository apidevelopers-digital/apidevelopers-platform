import { randomUUID } from "node:crypto";

const BASE_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

const clone = (value) => structuredClone(value);

export function normalizeHeaders(headers = {}) {
  const entries = Object.entries(headers).map(([name, value]) => [
    name.toLowerCase(),
    Array.isArray(value) ? value.join(", ") : value,
  ]);
  return Object.freeze(Object.fromEntries(entries));
}

export function normalizeRequestId(value, idFactory = randomUUID) {
  if (typeof value === "string" && REQUEST_ID_PATTERN.test(value.trim())) {
    return value.trim();
  }
  return idFactory();
}

export function createRequestContext(
  request = {},
  {
    clock = () => new Date().toISOString(),
    idFactory = randomUUID,
    baseUrl = "http://localhost",
  } = {},
) {
  const headers = normalizeHeaders(request.headers);
  const parsedUrl = new URL(request.url ?? "/", baseUrl);
  const requestId = normalizeRequestId(
    request.requestId ?? headers["x-request-id"],
    idFactory,
  );

  return Object.freeze({
    requestId,
    method: String(request.method ?? "GET").toUpperCase(),
    url: parsedUrl.pathname + parsedUrl.search,
    path: parsedUrl.pathname,
    query: Object.freeze(
      Object.fromEntries(
        [...parsedUrl.searchParams.entries()].map(([key, value]) => [key, value]),
      ),
    ),
    headers,
    remoteAddress: request.remoteAddress ?? null,
    receivedAt: clock(),
  });
}

export class PlatformError extends Error {
  constructor(code, message, {
    status = 400,
    details,
    expose = status < 500,
    cause,
  } = {}) {
    super(message, { cause });
    this.name = "PlatformError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.expose = expose;
  }
}

export function createPlatformError(code, message, options) {
  return new PlatformError(code, message, options);
}

export function normalizeError(error) {
  const status = Number.isInteger(error?.status)
    ? error.status
    : Number.isInteger(error?.statusCode)
      ? error.statusCode
      : 500;

  const expose = error?.expose ?? status < 500;
  const code = typeof error?.code === "string"
    ? error.code
    : status === 500
      ? "internal_error"
      : "invalid_request";

  return Object.freeze({
    status,
    code,
    message: expose && typeof error?.message === "string"
      ? error.message
      : "Unexpected platform error.",
    details: expose ? clone(error?.details ?? null) : null,
  });
}

export function createJsonResponse(
  status,
  payload,
  context,
  { headers = {} } = {},
) {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new TypeError("status must be a valid HTTP status code");
  }
  if (!context?.requestId) {
    throw new TypeError("request context with requestId is required");
  }

  const body = {
    ...(payload ?? {}),
    requestId: payload?.requestId ?? context.requestId,
  };

  return Object.freeze({
    status,
    headers: Object.freeze({
      ...BASE_HEADERS,
      "x-request-id": context.requestId,
      ...headers,
    }),
    body: JSON.stringify(body),
  });
}

export function toErrorResponse(error, context, options = {}) {
  const normalized = normalizeError(error);
  const payload = {
    error: normalized.code,
    message: normalized.message,
  };
  if (normalized.details != null) payload.details = normalized.details;
  return createJsonResponse(normalized.status, payload, context, options);
}
