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

export function createChatgptPluginGatewayBridge() {
  return Object.freeze({
    async handleRequest({ method = "GET", pathname = "/", body } = {}) {
      return tryHandlePluginRoute({
        method,
        url: pathname,
        body,
      });
    },
  });
}
