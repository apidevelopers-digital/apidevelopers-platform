import crypto from "node:crypto";

import {
  createBrowserSessionHandoffService,
} from "@apidevelopers/auth-core/browser-session-handoff";

import {
  createBrowserSessionHandoffHttpApp,
} from "./browser-session-handoff-http.mjs";

import {
  createPersistenceBackedBrowserSessionHandoffStore,
} from "./browser-session-handoff-persistence.mjs";

export const ZUNI_PREVIEW_HANDOFF_TARGET_ORIGIN =
  "https://preview-zuni.sitedauni.com";

export const ZUNI_PRODUCTION_HANDOFF_TARGET_ORIGIN =
  "https://zuni.sitedauni.com";

export const zuniPreviewBrowserSessionHandoffIssuePath =
  "/v1/zuni/browser-session/handoff/issue";

export const zuniPreviewBrowserSessionHandoffRedeemPath =
  "/v1/zuni/browser-session/handoff/redeem";

export const zuniPreviewBrowserSessionHandoffAuthorizePath =
  "/v1/zuni/browser-session/handoff/authorize";

export const zuniProductionBrowserSessionHandoffIssuePath =
  "/v1/zuni-production/browser-session/handoff/issue";

export const zuniProductionBrowserSessionHandoffRedeemPath =
  "/v1/zuni-production/browser-session/handoff/redeem";

export const zuniProductionBrowserSessionHandoffAuthorizePath =
  "/v1/zuni-production/browser-session/handoff/authorize";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});

const REDIRECT_HEADERS = Object.freeze({
  "cache-control": "no-store",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
});

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

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function createPkceVerifier() {
  return base64Url(crypto.randomBytes(32));
}

function codeChallengeFor(verifier) {
  return base64Url(crypto.createHash("sha256").update(verifier).digest());
}

function response(status, payload) {
  return Object.freeze({
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

function redirectResponse(location) {
  return Object.freeze({
    status: 303,
    headers: Object.freeze({
      ...REDIRECT_HEADERS,
      location,
    }),
    body: "",
  });
}

function safeFailure(error) {
  const code = String(error?.code ?? error?.message ?? "zuni_handoff_authorize_failed")
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/gu, "_")
    .slice(0, 120);

  const status = Number.isSafeInteger(error?.status)
    ? error.status
    : code === "source_session_required"
      ? 401
      : 503;

  return Object.freeze({
    status: [400, 401, 403, 409, 422, 429, 503].includes(status) ? status : 503,
    code: code || "zuni_handoff_authorize_failed",
  });
}

function createZuniHandoffAuthorizeApp({
  app,
  handoffService,
  targetOrigin,
  authorizePath,
  diagnostic,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest is required");
  }
  if (typeof handoffService?.issue !== "function") {
    throw new TypeError("handoffService.issue is required");
  }
  if (typeof targetOrigin !== "string" || !targetOrigin.trim()) {
    throw new TypeError("targetOrigin is required");
  }
  if (typeof authorizePath !== "string" || !authorizePath.startsWith("/")) {
    throw new TypeError("authorizePath must be an absolute path");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsed = new URL(
        String(request.url ?? "/"),
        "https://gateway.apidevelopers.digital",
      );

      if (parsed.pathname !== authorizePath) {
        return app.handleRequest(request);
      }

      if (method !== "GET") {
        return response(405, {
          ok: false,
          error: "method_not_allowed",
          allow: "GET",
          secretReturned: false,
        });
      }

      try {
        const verifier = createPkceVerifier();
        const issued = await handoffService.issue({
          headers: request.headers ?? {},
          targetOrigin,
          codeChallenge: codeChallengeFor(verifier),
        });

        const location = new URL("/", targetOrigin);
        location.hash = new URLSearchParams({
          trustLoginToken: issued.code,
          trustLoginVerifier: verifier,
        }).toString();

        return redirectResponse(location.toString());
      } catch (error) {
        const failure = safeFailure(error);
        return response(failure.status, {
          ok: false,
          error: failure.code,
          diagnostic,
          secretReturned: false,
          writes: false,
        });
      }
    },
  });
}

export function createZuniPreviewHandoffComposition({
  app,
  persistenceStore,
  sourceAuthenticator,
  redeemerAuthenticator,
  enabled = false,
  productionEnabled = true,
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
        mode: "zuni-preview",
        targetOrigin: ZUNI_PREVIEW_HANDOFF_TARGET_ORIGIN,
        productionTargetOrigin: ZUNI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
        productionEnabled: false,
        persistence: "not-configured",
        runtimeAutoWiring: true,
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
    allowedTargetOrigins: [
      ZUNI_PREVIEW_HANDOFF_TARGET_ORIGIN,
      ZUNI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
    ],
    ttlSeconds,
  });

  const previewHttp = createBrowserSessionHandoffHttpApp({
    app,
    handoffService,
    redeemerAuthenticator,
    redeemTargetOrigin: ZUNI_PREVIEW_HANDOFF_TARGET_ORIGIN,
    issuePath: zuniPreviewBrowserSessionHandoffIssuePath,
    redeemPath: zuniPreviewBrowserSessionHandoffRedeemPath,
  });

  if (
    previewHttp.enabled !== true ||
    typeof previewHttp.app?.handleRequest !== "function"
  ) {
    throw new TypeError("Zuni preview handoff HTTP composition is unavailable");
  }

  const previewAuthorizeApp = createZuniHandoffAuthorizeApp({
    app: previewHttp.app,
    handoffService,
    targetOrigin: ZUNI_PREVIEW_HANDOFF_TARGET_ORIGIN,
    authorizePath: zuniPreviewBrowserSessionHandoffAuthorizePath,
    diagnostic: "zuni_preview_handoff_authorize",
  });

  const productionHttp =
    productionEnabled === true
      ? createBrowserSessionHandoffHttpApp({
          app: previewAuthorizeApp,
          handoffService,
          redeemerAuthenticator,
          redeemTargetOrigin: ZUNI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
          issuePath: zuniProductionBrowserSessionHandoffIssuePath,
          redeemPath: zuniProductionBrowserSessionHandoffRedeemPath,
        })
      : Object.freeze({
          enabled: false,
          app: previewAuthorizeApp,
        });

  if (
    productionEnabled === true &&
    (productionHttp.enabled !== true ||
      typeof productionHttp.app?.handleRequest !== "function")
  ) {
    throw new TypeError("Zuni production handoff HTTP composition is unavailable");
  }

  const productionAuthorizeApp =
    productionEnabled === true
      ? createZuniHandoffAuthorizeApp({
          app: productionHttp.app,
          handoffService,
          targetOrigin: ZUNI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
          authorizePath: zuniProductionBrowserSessionHandoffAuthorizePath,
          diagnostic: "zuni_production_handoff_authorize",
        })
      : previewAuthorizeApp;

  return Object.freeze({
    enabled: true,
    app: productionAuthorizeApp,
    handoffService,
    handoffStore,
    descriptor: Object.freeze({
      mode: "zuni-preview-and-production",
      targetOrigin: ZUNI_PREVIEW_HANDOFF_TARGET_ORIGIN,
      productionTargetOrigin: ZUNI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
      productionEnabled: productionEnabled === true,
      persistence: "persistence-core",
      browserBinding: "S256",
      issuePath: zuniPreviewBrowserSessionHandoffIssuePath,
      redeemPath: zuniPreviewBrowserSessionHandoffRedeemPath,
      authorizePath: zuniPreviewBrowserSessionHandoffAuthorizePath,
      productionIssuePath: zuniProductionBrowserSessionHandoffIssuePath,
      productionRedeemPath: zuniProductionBrowserSessionHandoffRedeemPath,
      productionAuthorizePath: zuniProductionBrowserSessionHandoffAuthorizePath,
      oneTimeRedemptionRequired: true,
      redeemerServerAuthenticationRequired: true,
      runtimeAutoWiring: true,
    }),
  });
}
