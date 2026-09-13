import { secureCompareSecrets } from "@apidevelopers/auth-core";
import { createBrowserSessionAuthenticator } from "@apidevelopers/auth-core/browser-session-authenticator";
import { createUniAccountPreviewHandoffComposition } from "./browser-session-handoff-preview-composition.mjs";
import { createUniAccountPreviewAuthorizeHttpApp } from "./uni-account-preview-authorize-http.mjs";
import { createWebAgentShadowPersistenceProviders } from "./web-agent-shadow-persistence-providers.mjs";

const text = (value) => String(value ?? "").trim() || undefined;

function requireApp(app) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest is required");
  return app;
}

function requireStore(store) {
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    throw new TypeError("store must provide read and transaction");
  }
  return store;
}

function header(headers, name) {
  const target = String(name).toLowerCase();
  const entry = Object.entries(headers ?? {}).find(([key]) => String(key).toLowerCase() === target);
  const value = entry?.[1];
  return Array.isArray(value) ? value.join(", ") : value;
}

export function createUniAccountPreviewRedeemerAuthenticator({
  authorization,
  compareSecrets = secureCompareSecrets,
} = {}) {
  const expected = text(authorization);
  if (!expected) return Object.freeze({ configured: false, async authenticate() { return null; } });
  if (expected.length < 32) {
    throw new TypeError("preview handoff redeemer authorization must contain at least 32 characters");
  }
  if (typeof compareSecrets !== "function") throw new TypeError("compareSecrets must be a function");

  return Object.freeze({
    configured: true,
    async authenticate(headers = {}) {
      const provided = text(header(headers, "authorization"));
      if (!provided || !compareSecrets(provided, expected)) return null;
      return Object.freeze({
        role: "server",
        principal: Object.freeze({
          id: "server.site-uni-preview",
          name: "Site Uni Preview Handoff Redeemer",
          status: "active",
          scopes: Object.freeze(["account:handoff:redeem"]),
        }),
      });
    },
  });
}

export function createUniAccountPreviewRuntimeComposition({
  app,
  store,
  loginBootstrap,
  redeemerAuthorization,
  enabled = false,
  ttlSeconds = 60,
} = {}) {
  const baseApp = requireApp(app);
  const disabled = () => Object.freeze({
    enabled: false,
    app: baseApp,
    descriptor: Object.freeze({
      mode: "preview-only",
      productionEnabled: false,
      loginRequired: true,
      redeemerConfigured: false,
      runtimeAutoWiring: false,
    }),
  });

  if (enabled !== true) return disabled();

  const persistenceStore = requireStore(store);
  if (typeof loginBootstrap?.login !== "function") throw new TypeError("loginBootstrap.login is required");

  const redeemerAuthenticator = createUniAccountPreviewRedeemerAuthenticator({
    authorization: redeemerAuthorization,
  });
  if (redeemerAuthenticator.configured !== true) return disabled();

  const providers = createWebAgentShadowPersistenceProviders({ store: persistenceStore });
  const sourceAuthenticator = createBrowserSessionAuthenticator({
    resolveSessionByHash: providers.resolveSessionByHash,
  });
  const handoff = createUniAccountPreviewHandoffComposition({
    app: baseApp,
    persistenceStore,
    sourceAuthenticator,
    redeemerAuthenticator,
    enabled: true,
    ttlSeconds,
  });
  const authorize = createUniAccountPreviewAuthorizeHttpApp({
    app: handoff.app,
    loginBootstrap,
    handoffService: handoff.handoffService,
  });

  return Object.freeze({
    enabled: true,
    app: authorize,
    handoffService: handoff.handoffService,
    sourceAuthenticator,
    redeemerAuthenticator,
    descriptor: Object.freeze({
      mode: "preview-only",
      productionEnabled: false,
      loginRequired: true,
      targetOrigin: handoff.descriptor.targetOrigin,
      persistence: handoff.descriptor.persistence,
      browserBinding: handoff.descriptor.browserBinding,
      oneTimeRedemptionRequired: handoff.descriptor.oneTimeRedemptionRequired,
      redeemerServerAuthenticationRequired: handoff.descriptor.redeemerServerAuthenticationRequired,
      redeemerConfigured: true,
      runtimeAutoWiring: true,
    }),
  });
}
