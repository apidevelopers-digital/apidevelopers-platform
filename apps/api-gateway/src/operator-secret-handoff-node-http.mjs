const SECRET_ROUTE_PATTERN = /^\/v1\/operator\/secret-handoff\/[A-Za-z0-9._:-]{3,128}\/submit$/;
const DEFAULT_MAX_BYTES = 8 * 1024;

class SecretHandoffTransportError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "SecretHandoffTransportError";
    this.status = status;
    this.code = code;
  }
}

function isSecretHandoffRoute(request) {
  const url = new URL(request?.url ?? "/", "https://api-gateway.local");
  return SECRET_ROUTE_PATTERN.test(url.pathname);
}

function declaredContentLength(request) {
  const raw = request.headers?.["content-length"];
  if (raw === undefined) return null;
  const normalized = String(raw).trim();
  if (!/^\d+$/.test(normalized)) {
    throw new SecretHandoffTransportError(400, "secret_handoff_content_length_invalid");
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SecretHandoffTransportError(400, "secret_handoff_content_length_invalid");
  }
  return value;
}

async function readBytes(request, maxBytes) {
  const declaredLength = declaredContentLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new SecretHandoffTransportError(413, "secret_handoff_payload_too_large");
  }

  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        buffer.fill(0);
        throw new SecretHandoffTransportError(413, "secret_handoff_payload_too_large");
      }
      chunks.push(buffer);
    }
    if (chunks.length === 0) return Buffer.alloc(0);
    return Buffer.concat(chunks, total);
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}

function writeResponse(response, result) {
  response.writeHead(result.status, result.headers);
  response.end(result.body);
}

function writeTransportError(response, error) {
  response.writeHead(error.status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(JSON.stringify({ ok: false, error: error.code }));
}

export function createOperatorSecretHandoffNodeHandler({
  httpApp,
  maxBodyBytes = DEFAULT_MAX_BYTES,
} = {}) {
  if (typeof httpApp?.handleRequest !== "function") throw new TypeError("httpApp.handleRequest is required");
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > 8 * 1024) {
    throw new TypeError("secret_handoff_max_body_bytes_invalid");
  }

  return Object.freeze({
    matches: isSecretHandoffRoute,

    async handle(request, response) {
      if (!isSecretHandoffRoute(request)) return false;

      const method = String(request?.method ?? "GET").toUpperCase();
      if (method !== "POST") {
        const result = await httpApp.handleRequest({
          method: request.method,
          url: request.url,
          headers: request.headers,
        });
        writeResponse(response, result);
        return true;
      }

      let bodyBytes;
      try {
        bodyBytes = await readBytes(request, maxBodyBytes);
        const result = await httpApp.handleRequest({
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: bodyBytes,
        });
        writeResponse(response, result);
        return true;
      } catch (error) {
        if (error instanceof SecretHandoffTransportError) {
          writeTransportError(response, error);
          return true;
        }
        throw error;
      } finally {
        if (Buffer.isBuffer(bodyBytes)) bodyBytes.fill(0);
      }
    },
  });
}
