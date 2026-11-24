import { tryHandlePluginRoute } from "./plugin-routes.mjs";

export function createPluginAwareApp({ app } = {}) {
  if (!app || typeof app.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }

  return {
    async handleRequest(request) {
      const pluginResponse = await tryHandlePluginRoute(request);
      if (pluginResponse) return pluginResponse;

      return app.handleRequest(request);
    },
  };
}
