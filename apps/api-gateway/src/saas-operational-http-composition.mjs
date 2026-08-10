import { createSaasAccessComposition } from "./saas-access-composition.mjs";
import { createApp } from "./server.mjs";

function isSaasAccessRoute(url) {
  const requestUrl = new URL(String(url ?? "/"), "http://api-gateway.local");
  return requestUrl.pathname === "/v1/saas/access";
}

export function createSaasOperationalHttpComposition({
  app,
  authenticator,
  audit,
  store,
  clock,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (!store || typeof store.read !== "function") {
    throw new TypeError("store is required");
  }

  const saasComposition = createSaasAccessComposition({
    store,
    ...(clock ? { clock } : {}),
  });
  const saasApp = createApp({
    authenticator,
    audit,
    saasAccess: saasComposition.saasAccess,
  });

  const wrappedApp = Object.freeze({
    async handleRequest(request = {}) {
      if (isSaasAccessRoute(request.url)) {
        return saasApp.handleRequest(request);
      }
      return app.handleRequest(request);
    },
  });

  return Object.freeze({
    app: wrappedApp,
    saasRuntime: saasComposition.saasRuntime,
    saasAccess: saasComposition.saasAccess,
  });
}
