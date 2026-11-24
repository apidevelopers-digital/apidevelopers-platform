import { listPluginDefinitions } from "./plugin-gateway.mjs";
import { tryHandlePluginRoute } from "./plugin-routes.mjs";

const WRITE_OPERATION_PATTERN = /(?:^|\.)(execute|approve|deploy|render|upload|generate_file|materialize|snapshot)(?:\.|$)/u;

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
  if (body === undefined || body === null || String(body).trim() === "") return {};
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

function denyUnconfirmedWriteLikeCall({ method, pathname, body }) {
  if (String(method).toUpperCase() !== "POST") return null;
  if (!/^\/v1\/plugins\/[^/]+\/call$/u.test(String(pathname)) return null;

  const request = parseJsonObject(body);
  const dryRun = request.dry_run ?? request.dryRun ?? true;
  const operation = typeof request.operation === "string" ? request.operation : "";
  const confirmation = String(request.confirmation ?? "").trim();

  if (dryRun === false && WRITE_OPERATION_PATTERN.test(operation) && !confirmation) {
    const plugin = String(pathname).split("/")[3] ?? "unknown";
    return jsonResponse(403, {
      ok: false,
      error: "confirmation_required",
      plugin,
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

  if (payload && typeof payload === "object" && typeof payload.plugin === "string" && !payload.plugin.startsWith("ada-")) {
    payload.plugin = `ada-${payload.plugin}`;
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
