const SECRET_ROUTE_PATTERN = /^\\/v1\\/operator\\/secret-handoff\\/[A-Za-z0-9._:-]{3,128}\\/submit$/;
const DEFAULT_MAX_BYTES = 16 * 1024;

class SecretHandoffTransportError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "SecretHandoffTransportError";
    this.status = status;
    this.code = code;
  }
}

function isSecretHandoffRequest(request) {
  const method = String(request?.method ?? "GET").toUpperCase();
  if (method !== "POST") return false;
  const url = new URL(request?.url ?? "/", "https://api-gateway.local");
  return SECRET_ROUTE_PATTERN.test(url.pathname);
}

async function readBytes(request, maxBytes) {
  const declaredLength = Number(request.headers?.["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SecretHandoffTransportError(413, "secret_handoff_payload_too_large");
  }

  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk);
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
  });
  response.end(JSON.stringify({ ok: false, error: error.code }));
}

export function createOperatorSecretHandoffNodeHandler({
  httpApp,
  maxBodyBytes = DEFAULT_MAX_BYTES,
} = {}) {
  if (typeof httpApp?.handleRequest !== "function") throw new TypeError("httpApp.handleRequest is required");
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > 64 * 1024) {
    throw new TypeError("secret_handoff_max_body_bytes_invalid");
  }

  return Object.freeze({
    matches: isSecretHandoffRequest,

    async handle(request, response) {
      if (!isSecretHandoffRequest(request)) return false;

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
