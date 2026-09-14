import { createSaasAccessComposition } from "./saas-access-composition.mjs";
import { createUniCoPreviewBackendIdentityVerifier } from "./web-agent-preview-backend-identity.mjs";
import { createUniCoPreviewLoginHttpApp } from "./web-agent-preview-login-http.mjs";
import {
  createUniCoPreviewSaasAccessResolver,
  uniCoPreviewProductId,
  mitraPreviewProductId,
} from "./web-agent-preview-saas-access.mjs";
import {
  createUniCoPreviewBrowserSessionBootstrap,
  uniCoPreviewLoginHost,
  uniCoPreviewAgentId,
  mitraPreviewLoginHost,
  mitraPreviewAgentId,
} from "./web-agent-preview-session-bootstrap.mjs";

export const defaultPreviewLoginSurfaces = Object.freeze([
  Object.freeze({
    host: uniCoPreviewLoginHost,
    productId: uniCoPreviewProductId,
    agentId: uniCoPreviewAgentId,
  }),
  Object.freeze({
    host: mitraPreviewLoginHost,
    productId: mitraPreviewProductId,
    agentId: mitraPreviewAgentId,
  }),
]);

function primarySurface(loginSurfaces) {
  return Array.isArray(loginSurfaces) && loginSurfaces.length > 0
    ? loginSurfaces[0]
    : defaultPreviewLoginSurfaces[0];
}

export function createUniCoPreviewLoginComposition({
  app,
  store,
  verifyCredentials,
  identityBackendBaseUrl,
  identityFetchImpl,
  identityTimeoutMs,
  clock,
  generateSecret,
  sessionTtlSeconds,
  loginSurfaces = defaultPreviewLoginSurfaces,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest is required");
  }
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    throw new TypeError("store must provide read and transaction");
  }

  let effectiveVerifier = verifyCredentials,
  if (
    typeof effectiveVerifier !== "function" &&
    typeof identityBackendBaseUrl === "string" &&
    identityBackendBaseUrl.trim()
  ) {
    effectiveVerifier = createUniCoPreviewBackendIdentityVerifier({
      baseUrl: identityBackendBaseUrl,
      ...(identityFetchImpl ? { fetchImpl: identityFetchImpl } : {}),
      ...(identityTimeoutMs ? { timeoutMs: identityTimeoutMs } : {}),
    });
  }

  if (typeof effectiveVerifier !== "function") {
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
  const allowedProductIds = loginSurfaces.map((surface) => surface.productId);
  const resolveAccess = createUniCoPreviewSaasAccessResolver({
    accessRuntime: saasAccess,
    allowedProductIds,
  });
  const bootstrap = createUniCoPreviewBrowserSessionBootstrap({
    store,
    verifyCredentials: effectiveVerifier,
    resolveAccess,
    loginSurfaces,
    ...(clock ? { clock } : {}),
    ...(generateSecret ? { generateSecret } : {}),
    ...(sessionTtlSeconds ? { sessionTtlSeconds } : {}),
  });
  const http = createUniCoPreviewLoginHttpApp({ app, bootstrap });
  const primary = primarySurface(loginSurfaces);

  return Object.freeze({
    enabled: true,
    app: http.app,
    bootstrap,
    saasAccess,
    descriptor: Object.freeze({
      enabled: true,
      mode: "preview-assisted",
      host: primary.host,
      productId: primary.productId,
      agentId: primary.agentId,
      products: Object.freeze(loginSurfaces.map((surface) => Object.freeze({
        productId: surface.productId,
        host: surface.host,
        agentId: surface.agentId,
      }))),
      identityBackendConfigured:
        typeof identityBackendBaseUrl === "string" && identityBackendBaseUrl.trim().length > 0,
      automaticProvisioning: false,
      rawSessionSecretPersisted: false,
      transientOperatorSessionReturnedToBrowser: false,
    }),
  });
}
