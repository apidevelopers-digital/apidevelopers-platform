import { createHash } from "node:crypto";

import { createDurableRepository } from "@apidevelopers/persistence-core";

export const webAgentShadowPersistenceCollections = Object.freeze({
  browserSessions: "web.browserSessions",
  tenantInternationalProfiles: "web.tenantInternationalProfiles",
  commercialContexts: "web.commercialContexts",
});

const SESSION_HASH = /^[a-f0-9]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function requireSessionHash(value) {
  const hash = requireText(value, "sessionHash").toLowerCase();
  if (!SESSION_HASH.test(hash)) {
    throw new TypeError("sessionHash must be a SHA-256 hex digest");
  }
  return hash;
}

function requireCurrency(value) {
  const currency = requireText(value, "currency").toUpperCase();
  if (!CURRENCY.test(currency)) {
    throw new TypeError("currency must be an ISO 4217-style three-letter code");
  }
  return currency;
}

export function createWebAgentShadowCommercialContextId({
  tenantId,
  workspaceId,
  productId,
} = {}) {
  const identity = [
    requireText(tenantId, "tenantId"),
    requireText(workspaceId, "workspaceId"),
    requireText(productId, "productId"),
  ].join("\0");

  return `web-commercial.${createHash("sha256").update(identity, "utf8").digest("hex")}`;
}

export function createWebAgentShadowPersistenceProviders({ store } = {}) {
  if (
    !store ||
    typeof store.read !== "function" ||
    typeof store.transaction !== "function"
  ) {
    throw new TypeError("store must provide read and transaction");
  }

  const sessions = createDurableRepository({
    store,
    collection: webAgentShadowPersistenceCollections.browserSessions,
    idField: "sessionHash",
  });
  const tenantProfiles = createDurableRepository({
    store,
    collection: webAgentShadowPersistenceCollections.tenantInternationalProfiles,
    idField: "tenantId",
  });
  const commercialContexts = createDurableRepository({
    store,
    collection: webAgentShadowPersistenceCollections.commercialContexts,
    idField: "commercialContextId",
  });

  async function resolveSessionByHash(sessionHash) {
    return sessions.getById(requireSessionHash(sessionHash));
  }

  const tenantInternationalProfile = Object.freeze({
    async resolve({ tenantId } = {}) {
      const normalizedTenantId = requireText(tenantId, "tenantId");
      const record = await tenantProfiles.getById(normalizedTenantId);
      if (!record) {
        throw new RangeError("tenant international profile not found");
      }

      return Object.freeze({
        defaultLocale: requireText(record.defaultLocale, "defaultLocale"),
        fallbackLocale: requireText(record.fallbackLocale ?? "en", "fallbackLocale"),
        timeZone: requireText(record.timeZone, "timeZone"),
        legalRegion: requireText(record.legalRegion, "legalRegion"),
      });
    },
  });

  const commercialContext = Object.freeze({
    async resolve({ tenantId, workspaceId, productId } = {}) {
      const commercialContextId = createWebAgentShadowCommercialContextId({
        tenantId,
        workspaceId,
        productId,
      });
      const record = await commercialContexts.getById(commercialContextId);
      if (!record) {
        throw new RangeError("commercial context not found");
      }

      return Object.freeze({
        currency: requireCurrency(record.currency),
      });
    },
  });

  return Object.freeze({
    resolveSessionByHash,
    tenantInternationalProfile,
    commercialContext,
  });
}
