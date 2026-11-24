import { listPluginDefinitions } from "./plugin-gateway.mjs";
import { tryHandlePluginRoute } from "./plugin-routes.mjs";

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
      const response = await tryHandlePluginRoute({
        method,
        url: pathname,
        body,
      });

      return withLegacyPluginShape(response, { method });
    },
  });
}
