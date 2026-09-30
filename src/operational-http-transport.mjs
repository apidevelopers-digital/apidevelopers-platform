import http from "node:http";
import { maybeHandleGatewayPublicLanding } from "./node-public-landing.mjs";
import { createOperatorSecretHandoffNodeHandler } from "./operator-secret-handoff-node-http.mjs";

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

function materializeRequestBodyValue(value, maxBodyBytes) {
  if (value === undefined || value === null) return undefined;

  const body = typeof value === "string" || Buffer.isBuffer(value)
    ? value
    : JSON.stringify(value);
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));

  if (buffer.length > maxBodyBytes) {
    throw new OperationalTransportError("request_too_large", 413);
  }

  return buffer.length > 0 ? buffer.toString("utf8") : undefined;
}

async function readEventedRequestBody(request, maxBodyBytes) {
  const chunks = [];
  let size = 0;

  await new Promise((resolve, reject) => {
    request.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;

      if (size > maxBodyBytes) {
        reject(new OperationalTransportError("request_too_large", 413));
        return;
      }

      chunks.push(buffer);
    });
    request.once("end", resolve);
    request.once("error", reject);
  });

  return chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : undefined;
}

async function readRequestBody(request, maxBodyBytes) {
  const method = String(request.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return undefined;

  if (Object.hasOwn(request, "body")) {
    return materializeRequestBodyValue(request.body, maxBodyBytes);
  }

  const chunks = [];
  let size = 0;

  if (typeof request?.[Symbol.asyncIterator] === "function") {
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

  if (typeof request?.on === "function" && typeof request?.once === "function") {
    return readEventedRequestBody(request, maxBodyBytes);
  }

  throw new OperationalTransportError("request_body_unreadable", 400);
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


function writeUnhandledTransportExceptionTelemetry(logger, { method, path, error }) {
  const writer =
    typeof logger?.error === "function"
      ? logger.error.bind(logger)
      : typeof logger?.log === "function"
        ? logger.log.bind(logger)
        : null;
  if (!writer) return;

  writer(JSON.stringify(Object.freeze({
    method,
    path,
    error: Object.freeze({
      name: typeof error?.name === "string" ? error.name : "Error",
      message: typeof error?.message === "string" ? error.message : String(error),
    }),
  })));
}

export function createOperationalHttpServer({
  app,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  logger = console,
  secretHandoffHttpApp,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }

  const bodyLimit = validateMaxBodyBytes(maxBodyBytes);
  const secretHandoffNodeHandler = secretHandoffHttpApp === undefined
    ? null
    : createOperatorSecretHandoffNodeHandler({ httpApp: secretHandoffHttpApp });

  return http.createServer(async (request, response) => {
    const path = requestPath(request.url);
    const isConversation = path === WEB_AGENT_CONVERSATION_PATH;

    if (maybeHandleGatewayPublicLanding(request, response)) return;

    try {
      if (
        secretHandoffNodeHandler &&
        await secretHandoffNodeHandler.handle(request, response)
      ) {
        return;
      }

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

      const method = String(request.method ?? "GET").toUpperCase();
      writeUnhandledTransportExceptionTelemetry(logger, {
        method,
        path,
        error,
      });

      if (isConversation) {
        writeConversationTelemetry(logger, {
          stage: "transport_error",
          method,
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
  secretHandoffHttpApp,
} = {}) {
  const server = createOperationalHttpServer({
    app,
    maxBodyBytes,
    logger,
    ...(secretHandoffHttpApp !== undefined ? { secretHandoffHttpApp } : {}),
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  return server;
}
