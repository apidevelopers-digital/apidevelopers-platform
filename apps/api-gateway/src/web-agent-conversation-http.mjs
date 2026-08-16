import http from "node:http";

import { bindWebAgentSurfaceRequest } from "./web-agent-surface-policy.mjs";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
});
export const webAgentConversationHttpPath = "/v1/web-agent/conversations";
export const webAgentConversationMaxBodyBytes = 64 * 1024;

class RequestTransportError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "RequestTransportError";
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(status, payload) {
  return Object.freeze({
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

function isJsonContentType(value) {
  if (typeof value !== "string") return false;
  return value.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

async function readJsonBody(request, maxBytes) {
  if (!isJsonContentType(request.headers["content-type"])) {
    throw new RequestTransportError(415, "unsupported_media_type");
  }

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

  if (chunks.length === 0) {
    throw new RequestTransportError(400, "invalid_json");
  }

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new RequestTransportError(400, "invalid_json");
    }
    return parsed;
  } catch (error) {
    if (error instanceof RequestTransportError) throw error;
    throw new RequestTransportError(400, "invalid_json");
  }
}

export function createWebAgentConversationHttpRoute({
  boundary,
  maxBodyBytes = webAgentConversationMaxBodyBytes,
} = {}) {
  if (boundary !== undefined && typeof boundary?.handle !== "function") {
    throw new TypeError("boundary.handle must be a function");
  }
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new TypeError("maxBodyBytes must be a positive integer");
  }

  return Object.freeze({
    method: "POST",
    path: webAgentConversationHttpPath,
    maxBodyBytes,

    async handle({ method = "GET", url = "/", headers = {}, body } = {}) {
      const normalizedMethod = String(method).toUpperCase();
      const requestUrl = new URL(String(url), "http://api-gateway.local");

      if (
        normalizedMethod !== "POST" ||
        requestUrl.pathname !== webAgentConversationHttpPath
      ) {
        return null;
      }

      if (!boundary) {
        return jsonResponse(503, {
          error: "web_agent_conversation_unavailable",
        });
      }

      let surfaceBoundRequest;
      try {
        surfaceBoundRequest = bindWebAgentSurfaceRequest({ headers, body });
      } catch (error) {
        if (error?.code === "product_surface_agent_mismatch") {
          return jsonResponse(403, {
            error: "product_surface_agent_mismatch",
          });
        }
        throw error;
      }

      const result = await boundary.handle({
        headers,
        body: surfaceBoundRequest.body,
      });
      if (
        !result ||
        typeof result !== "object" ||
        !Number.isInteger(result.status) ||
        !result.payload ||
        typeof result.payload !=== "object" ||
        Array.isArray(result.payload)
      ) {
        return jsonResponse(502, {
          error: "invalid_web_agent_boundary_response",
        });
      }

      return jsonResponse(result.status, result.payload);
    },

    async readBody(request) {
      return readJsonBody(request, maxBodyBytes);
    },
  });
}

export function createWebAgentConversationPreviewServer({
  route = createWebAgentConversationHttpRoute(),
} = {}) {
  if (
    typeof route?.handle !== "function" ||
    typeof route?.readBody !== "function"
  ) {
    throw new TypeError("route must provide handle and readBody");
  }

  return http.createServer(async (request, response) => {
    try {
      const method = String(request.method ?? "GET").toUpperCase();
      const requestUrl = new URL(
        String(request.url ?? "/"),
        "http://api-gateway.local",
      );
      let body;

      if (
        method === "POST" &&
        requestUrl.pathname === webAgentConversationHttpPath
      ) {
        body = await route.readBody(request);
      }

      const result = await route.handle({
        method,
        url: request.url,
        headers: request.headers,
        body,
      });

      if (!result) {
        response.writeHead(404, JSON_HEADERS);
        response.end(JSON.stringify({ error: "not_found" }));
        return;
      }

      response.writeHead(result.status, result.headers);
      response.end(result.body);
    } catch (error) {
      const status =
        error instanceof RequestTransportError ? error.status : 500;
      const code =
        error instanceof RequestTransportError
          ? error.code
          : "internal_error";

      response.writeHead(status, JSON_HEADERS);
      response.end(JSON.stringify({ error: code }));
    }
  });
}
