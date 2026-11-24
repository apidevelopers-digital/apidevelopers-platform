import { listPluginDefinitions } from "./plugin-gateway.mjs";
import { tryHandlePluginRoute } from "./plugin-routes.mjs";

const WRITE_OPERATION_SEGMENTS = new Set([
  "execute",
  "approve",
  "deploy",
  "render",
  "upload",
  "generate_file",
  "materialize",
  "snapshot",
]);

export const MACROPLUGINS = Object.freeze(
  Object.fromEntries(
    listPluginDefinitions().map((definition) => [
      definition.id,
      {
        id: `ada-${definition.id}`,
        risk: definition.risk,
        defaultMode: definition.defaultMode,
        operations: definition.operations,
      },
    ])
  )
);

function parseJsonObject(body) {
  if (body === undefined || body === null) return {};
  if (typeof body === "object" && !Array.isArray(body) && !Buffer.isBuffer(body)) return body;
  if (String(body).trim() === "") return {};
  try {
    const parsed = JSON.parse(String(body));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function jsonResponse(status, payload) {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
}

function isPluginCallPath(pathname) {
  const parts = String(pathname ?? "").split("/").filter(Boolean);
  return parts.length === 4 && parts[0] === "v1" && parts[1] === "plugins" && parts[3] === "call";
}

function pluginIdFromPath(pathname) {
  const parts = String(pathname ?? "").split("/").filter(Boolean);
  return parts[2] ?? "unknown";
}

function isWriteLikeOperation(operation) {
  return String(operation ?? "")
    .split(".")
    .some((segment) => WRITE_OPERATION_SEGMENTS.has(segment));
}

function denyUnconfirmedWriteLikeCall({ method, pathname, body }) {
  if (String(method ?? "GET").toUpperCase() !== "POST") return null;
  if (!isPluginCallPath(pathname)) return null;

  const request = parseJsonObject(body);
  const dryRun = request.dry_run ?? request.dryRun ?? true;
  const operation = typeof request.operation === "string" ? request.operation : "";
  const confirmation = String(request.confirmation ?? "").trim();

  if (dryRun === false && isWriteLikeOperation(operation) && !confirmation) {
    return jsonResponse(403, {
      ok: false,
      error: "confirmation_required",
      plugin: pluginIdFromPath(pathname),
      operation,
    });
  }

  return null;
}

function withLegacyPluginShape(response, { method = "GET" } = {}) {
  if (!response || typeof response !== "object" || typeof response.body !== "string") {
    return response;
  }

  let payload;
  try {
    payload = JSON.parse(response.body);
  } catch {
    return response;
  }

  if (payload && typeof payload === "object") {
    const existingPlugin = typeof payload.plugin === "string" ? payload.plugin : null;
    const inferredPlugin = existingPlugin ?? (typeof payload.id === "string" ? payload.id : null);

    if (inferredPlugin && !String(inferredPlugin).startsWith("ada-")) {
      payload.plugin = `ada-${inferredPlugin}`;
    } else if (inferredPlugin) {
      payload.plugin = inferredPlugin;
    }
  }

  if (
    String(method).toUpperCase() === "POST" &&
    response.status === 200 &&
    payload &&
    typeof payload === "object" &&
    payload.ok === true
  ) {
    payload.status = "accepted_by_gateway_draft";
  }

  return {
    ...response,
    body: JSON.stringify(payload),
  };
}

export function createChatgptPluginGatewayBridge() {
  return Object.freeze({
    async handleRequest({ method = "GET", pathname = "/", body } = {}) {
      const denied = denyUnconfirmedWriteLikeCall({ method, pathname, body });
      if (denied) return denied;

      const response = await tryHandlePluginRoute({
        method,
        url: pathname,
        body,
      });

      return withLegacyPluginShape(response, { method });
    },
  });
}
