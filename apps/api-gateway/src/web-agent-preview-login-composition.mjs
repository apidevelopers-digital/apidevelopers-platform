import { createSaasAccessComposition } from "./saas-access-composition.mjs";
import { createUniCoPreviewLoginHttpApp } from "./web-agent-preview-login-http.mjs";
import { createUniCoPreviewSaasAccessResolver } from "./web-agent-preview-saas-access.mjs";
import { createUniCoPreviewBrowserSessionBootstrap } from "./web-agent-preview-session-bootstrap.mjs";

export function createUniCoPreviewLoginComposition({
  app,
  store,
  verifyCredentials,
  clock,
  generateSecret,
  sessionTtlSeconds,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest is required");
  }
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    throw new TypeError("store must provide read and transaction");
  }

  if (typeof verifyCredentials !== "function") {
    return Object.freeze({
      enabled: false,
      app,
      descriptor: Object.freeze({
        enabled: false,
        mode: "preview-assisted",
        reason: "identity_verifier_unavailable",
      }),
    });
  }

  const { saasAccess } = createSaasAccessComposition({
    store,
    ...(clock ? { clock: () => clock().toISOString() } : {}),
  });
  const resolveAccess = createUniCoPreviewSaasAccessResolver({ accessRuntime: saasAccess });
  const bootstrap = createUniCoPreviewBrowserSessionBootstrap({
    store,
    verifyCredentials,
    resolveAccess,
    ...(clock ? { clock } : {}),
    ...(generateSecret ? { generateSecret } : {}),
    ...(sessionTtlSeconds ? { sessionTtlSeconds } : {}),
  });
  const http = createUniCoPreviewLoginHttpApp({ app, bootstrap });

  return Object.freeze({
    enabled: true,
    app: http.app,
    bootstrap,
    saasAccess,
    descriptor: Object.freeze({
      enabled: true,
      mode: "preview-assisted",
      productId: "product:uni-co",
      host: "unico-preview.apidevelopers.digital",
      automaticProvisioning: false,
      rawSessionSecretPersisted: false,
    }),
  });
}
