import http from "node:http";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
});
const MAX_BODY_BYTES = 64 * 1024;

class RequestTransportError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "RequestTransportError";
    this.status = status;
    this.code = code;
  }
}

async function readBody(request, maxBytes = MAX_BODY_BYTES) {
  const method = String(request.method ?? "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH"].includes(method)) return undefined;

  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestTransportError(413, "payload_too_large");
  }

  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new RequestTransportError(413, "payload_too_large");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks).toString("utf8");
}

export function createOperatorGatewayHttpServer({ app, maxBodyBytes = MAX_BODY_BYTES } = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }

  return http.createServer(async (request, response) => {
    try {
      const body = await readBody(request, maxBodyBytes);
      const result = await app.handleRequest({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });

      response.writeHead(result.status, result.headers);
      response.end(result.body);
    } catch (error) {
      const status =
        error instanceof RequestTransportError ? error.status : 500;
      const code =
        error instanceof RequestTransportError ? error.code : "internal_error";

      response.writeHead(status, JSON_HEADERS);
      response.end(
        JSON.stringify({
          error: code,
          productionChanged: false,
          contentReturned: false,
        }),
      );
    }
  });
}

export async function startOperatorGatewayHttpServer({
  port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? "127.0.0.1",
  app,
  maxBodyBytes,
} = {}) {
  const server = createOperatorGatewayHttpServer({ app, maxBodyBytes });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  return server;
}
