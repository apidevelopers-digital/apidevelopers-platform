import { secureCompareSecrets } from "@apidevelopers/auth-core";

import { createUniAccountPreviewAccessContextComposition } from "./account-access-context-preview-composition.mjs";

export const UNI_ACCOUNT_PREVIEW_ACCESS_CONTEXT_CONSUMER_PRINCIPAL_ID =
  "server.site-uni-preview-access-context";

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function readHeader(headers, name) {
  const target = String(name).toLowerCase();
  const entry = Object.entries(headers ?? {}).find(
    ([key]) => String key).toLowerCase() === target,
  );
  const value = entry?.[1];
  return Array.isArray(value) ? value.join(", ") : value;
}

export function createUniAccountPreviewAccessContextConsumerAuthenticator({
  authorization,
  compareSecrets = secureCompareSecrets,
} = {}) {
  const expected = optionalText(authorization);
  if (!expected) {
    return Object.freeze({
      configured: false,
      async authenticate() {
        return null;
      },
    });
  }
  if (expected.length < 32) {
    throw new TypeError(
      "preview access-context authorization must contain at least 32 characters",
    );
  }
  if (typeof compareSecrets !== "function") {
    throw new TypeError("compareSecrets must be a function");
  }

  return Object.freeze({
    configured: true,
    async authenticate(headers = {}) {
      const provided = optionalText(readHeader(headers, "authorization"));
      if (!provided || !compareSecrets(provided, expected)) return null;

      return Object.freeze({
        role: "server",
        principal: Object.freeze({
          id: UNI_ACCOUNT_PREVIEW_ACCESS_CONTEXT_CONSUMER_PRINCIPAL_ID,
          name: "Site Uni Preview Access Context Consumer",
          status: "active",
          scopes: Object.freeze(["account:access-context:resolve"]),
        }),
      });
    },
  });
}

export function createUniAccountPreviewAccessContextRuntimeComposition({
  app,
  store,
  consumerAuthorization,
  enabled = false,
  clock,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest is required");
  }

  const disabled = () =>
    Object.freeze({
      enabled: false,
      app,
      descriptor: Object.freeze({
        mode: "preview-only",
        productionEnabled: false,
        consumerConfigured: false,
        runtimeAutoWiring: false,
      }),
    });

  if (enabled !== true) return disabled();

  const consumerAuthenticator =
    createUniAccountPreviewAccessContextConsumerAuthenticator({
      authorization: consumerAuthorization,
    });
  if (consumerAuthenticator.configured !== true) return disabled();

  const composed = createUniAccountPreviewAccessContextComposition({
    app,
    persistenceStore: store,
    consumerAuthenticator,
    consumerPrincipalId:
      UNI_ACCOUNT_PREVIEW_ACCESS_CONTEXT_CONSUMER_PRINCIPAL_ID,
    enabled: true,
    ...(clock ? { clock } : {}),
  });

  if (
    composed?.enabled !== true ||
    typeof composed?.app?.handleRequest !== "function"
  ) {
    throw new TypeError("configured preview access-context is unavailable");
  }

  return Object.freeze({
    enabled: true,
    app: composed.app,
    resolver: composed.resolver,
    consumerAuthenticator,
    descriptor: Object.freeze({
      ...composed.descriptor,
      consumerConfigured: true,
      runtimeAutoWiring: true,
    }),
  });
}
