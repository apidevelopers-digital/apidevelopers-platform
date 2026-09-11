import {
  createBrowserSessionHandoffService,
} from "@apidevelopers/auth-core/browser-session-handoff";

import {
  createBrowserSessionHandoffHttpApp,
} from "./browser-session-handoff-http.mjs";

import {
  createPersistenceBackedBrowserSessionHandoffStore,
} from "./browser-session-handoff-persistence.mjs";

export const UNIJURI_PRODUCTION_HANDOFF_TARGET_ORIGIN =
  "https://unijuri.sitedauni.com";

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

/**
 * Production contract for UniJuri browser-session handoff.
 *
 * Deliberately dormant: this module never reads runtime environment directly and is not wired
 * into operational-runtime. A later, separately reviewed activation must inject
 * the source/redeemer authenticators and persistence store explicitly.
 */
export function createUniJuriProductionHandoffComposition({
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
        mode: "production-contract",
        targetOrigin: UNIJURI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
        productionEnabled: false,
        persistence: "not-configured",
        browserBinding: "S256",
        oneTimeRedemptionRequired: true,
        redeemerServerAuthenticationRequired: true,
        runtimeAutoWiring: false,
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
    allowedTargetOrigins: [UNIJURI_PRODUCTION_HANDOFF_TARGET_ORIGIN],
    ttlSeconds,
  });

  const http = createBrowserSessionHandoffHttpApp({
    app,
    handoffService,
    redeemerAuthenticator,
    redeemTargetOrigin: UNIJURI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
  });

  if (http.enabled !== true || typeof http.app?.handleRequest !== "function") {
    throw new TypeError("production handoff HTTP composition is unavailable");
  }

  return Object.freeze({
    enabled: true,
    app: http.app,
    handoffService,
    handoffStore,
    descriptor: Object.freeze({
      mode: "production-contract",
      targetOrigin: UNIJURI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
      productionEnabled: true,
      persistence: "persistence-core",
      browserBinding: "S256",
      oneTimeRedemptionRequired: true,
      redeemerServerAuthenticationRequired: true,
      runtimeAutoWiring: false,
    }),
  });
}
