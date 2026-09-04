import {
  createBrowserSessionHandoffService,
} from "@apidevelopers/auth-core/browser-session-handoff";

import {
  createBrowserSessionHandoffHttpApp,
} from "./browser-session-handoff-http.mjs";

import {
  createPersistenceBackedBrowserSessionHandoffStore,
} from "./browser-session-handoff-persistence.mjs";

export const UNI_ACCOUNT_PREVIEW_HANDOFF_TARGET_ORIGIN =
  "https://uni-preview.apidevelopers.digital";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

function requireAuthenticator(value, name) {
  if (!value || typeof value.authenticate !== "function") {
    throw new TypeError(`${name}.authenticate is required`);
  }
  return value;
}

export function createUniAccountPreviewHandoffComposition({
  app,
  persistenceStore,
  sourceAuthenticator,
  redeemerAuthenticator,
  enabled = false,
  ttlSeconds = 60,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest is required");
  }

  if (enabled !== true) {
    return Object.freeze({
      enabled: false,
      app,
      descriptor: Object.freeze({
        mode: "preview-only",
        targetOrigin: UNI_ACCOUNT_PREVIEW_HANDOFF_TARGET_ORIGIN,
        productionEnabled: false,
        persistence: "not-configured",
      }),
    });
  }

  requireAuthenticator(sourceAuthenticator, "sourceAuthenticator");
  requireAuthenticator(redeemerAuthenticator, "redeemerAuthenticator");
  requireFunction(persistenceStore?.transaction, "persistenceStore.transaction");

  const handoffStore = createPersistenceBackedBrowserSessionHandoffStore({
    persistenceStore,
  });

  const handoffService = createBrowserSessionHandoffService({
    sourceAuthenticator,
    store: handoffStore,
    allowedTargetOrigins: [UNI_ACCOUNT_PREVIEW_HANDOFF_TARGET_ORIGIN],
    ttlSeconds,
  });

  const http = createBrowserSessionHandoffHttpApp({
    app,
    handoffService,
    redeemerAuthenticator,
    redeemTargetOrigin: UNI_ACCOUNT_PREVIEW_HANDOFF_TARGET_ORIGIN,
  });

  if (http.enabled !== true || typeof http.app?.handleRequest !== "function") {
    throw new TypeError("preview handoff HTTP composition is unavailable");
  }

  return Object.freeze({
    enabled: true,
    app: http.app,
    handoffService,
    handoffStore,
    descriptor: Object.freeze({
      mode: "preview-only",
      targetOrigin: UNI_ACCOUNT_PREVIEW_HANDOFF_TARGET_ORIGIN,
      productionEnabled: false,
      persistence: "persistence-core",
      browserBinding: "S256",
      oneTimeRedemptionRequired: true,
      redeemerServerAuthenticationRequired: true,
      runtimeAutoWiring: false,
    }),
  });
}
