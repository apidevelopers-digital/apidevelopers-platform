import { createSaasAccessComposition } from "./saas-access-composition.mjs";
import { createDelegatedSaasAccessApp } from "./saas-delegated-access-v2.mjs";
import { createSaasProvisioningApp } from "./saas-provisioning.mjs";
import { createApp } from "./server.mjs";

function pathnameOf(url) {
  return new URL(String(url ?? "/"), "http://api-gateway.local").pathname;
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
  const delegatedApp = createDelegatedSaasAccessApp({
    authenticator,
    saasAccess: saasComposition.saasAccess,
    federatedPrincipal: saasComposition.federatedPrincipal,
  });
  const provisioningApp = createSaasProvisioningApp({
    authenticator,
    saasRuntime: saasComposition.saasRuntime,
    saasAccess: saasComposition.saasAccess,
    federatedPrincipal: saasComposition.federatedPrincipal,
    ...(clock ? { clock } : {}),
  });

  const wrappedApp = Object.freeze({
    async handleRequest(request = {}) {
      const pathname = pathnameOf(request.url);
      if (pathname === "/v1/saas/provision") {
        return provisioningApp.handleRequest(request);
      }
      if (pathname === "/v1/saas/access/delegated") {
        return delegatedApp.handleRequest(request);
      }
      if (pathname === "/v1/saas/access") {
        return saasApp.handleRequest(request);
      }
      return app.handleRequest(request);
    },
  });

  return Object.freeze({
    app: wrappedApp,
    saasRuntime: saasComposition.saasRuntime,
    saasAccess: saasComposition.saasAccess,
    federatedPrincipal: saasComposition.federatedPrincipal,
  });
}
