import http from "node:http";
import { maybeHandleGatewayPublicLanding } from "./node-public-landing.mjs";

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const WEB_AGENT_CONVERSATION_PATH = "/v1/web-agent/conversations";
const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
});

class OperationalTransportError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "OperationalTransportError";
    this.code = code;
    this.status = status;
  }
}

function validateMaxBodyBytes(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 1024 ||
    value > 1024 * 1024
  ) {
    throw new TypeError(
      "maxBodyBytes must be an integer between 1024 and 1048576",
    );
  }
  return value;
}

async function readRequestBody(request, maxBodyBytes) {
  const method = String(request.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return undefined;

  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maxBodyBytes) {
      throw new OperationalTransportError("request_too_large", 413);
    }

    chunks.push(buffer);
  }

  return chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : undefined;
}

function writeJson(response, status, payload) {
  response.writeHead(status, JSON_HEADERS);
  response.end(JSON.stringify(payload));
}

function requestPath(url) {
  try {
    return new URL(String(url ?? "/"), "http://api-gateway.local").pathname;
  } catch {
    return "/";
  }
}

function publicErrorCode(body) {
  if (typeof body !== "string" || !body) return null;
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.error === "string" ? parsed.error : null;
  } catch {
    return null;
  }
}

function writeConversationTelemetry(logger, payload) {
  if (typeof logger?.log !== "function") return;
  logger.log(JSON.stringify(Object.freeze({
    event: "web_agent_conversation_http",
    ...payload,
  })));
}

export function createOperationalHttpServer({
  app,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  logger = console,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }

  const bodyLimit = validateMaxBodyBytes(maxBodyBytes);

  return http.createServer(async (request, response) => {
    const path = requestPath(request.url);
    const isConversation = path === WEB_AGENT_CONVERSATION_PATH;

    if (maybeHandleGatewayPublicLanding(request, response)) return;

    try {
      const body = await readRequestBody(request, bodyLimit);
      const result = await app.handleRequest({
        method: request.method,
        url: request.url,
        headers: request.headers,
        ...(body !== undefined ? { body } : {}),
      });

      if (isConversation) {
        writeConversationTelemetry(logger, {
          stage: "app_response",
          method: String(request.method ?? "GET").toUpperCase(),
          path,
          status: result.status,
          bodyBytes: Buffer.byteLength(String(result.body ?? ""), "utf8"),
          contentType:
            typeof result.headers?.["content-type"] === "string"
              ? result.headers["content-type"]
              : null,
          error: publicErrorCode(result.body),
        });
      }

      response.writeHead(result.status, result.headers);
      response.end(result.body);
    } catch (error) {
      if (error instanceof OperationalTransportError) {
        if (isConversation) {
          writeConversationTelemetry(logger, {
            stage: "transport_error",
            method: String(request.method ?? "GET").toUpperCase(),
            path,
            status: error.status,
            bodyBytes: 0,
            contentType: JSON_HEADERS["content-type"],
            error: error.code,
          });
        }
        writeJson(response, error.status, {
          error: error.code,
          productionChanged: false,
          contentReturned: false,
          rowsReturned: false,
          valuesReturned: false,
        });
        return;
      }

      if (isConversation) {
        writeConversationTelemetry(logger, {
          stage: "transport_error",
          method: String(request.method ?? "GET").toUpperCase(),
          path,
          status: 500,
          bodyBytes: 0,
          contentType: JSON_HEADERS["content-type"],
          error: "internal_error",
        });
      }

      writeJson(response, 500, {
        error: "internal_error",
        productionChanged: false,
        contentReturned: false,
        rowsReturned: false,
        valuesReturned: false,
      });
    }
  });
}

export async function startOperationalHttpServer({
  app,
  port = 3000,
  host = "127.0.0.1",
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  logger = console,
} = {}) {
  const server = createOperationalHttpServer({ app, maxBodyBytes, logger });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  return server;
}
