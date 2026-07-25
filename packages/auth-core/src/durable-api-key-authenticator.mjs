import { verifyApiKeyHash } from "@apidevelopers/apikey-core";

import {
  extractApiKey,
  normalizeHeaders,
  secureCompareSecrets,
} from "./index.mjs";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

function requireRepository(repository) {
  if (typeof repository?.getActiveByPrefix !== "function") {
    throw new TypeError("repository.getActiveByPrefix must be a function");
  }
  return repository;
}

function freezeIdentity(role, principal) {
  return Object.freeze({
    role,
    principal: Object.freeze(structuredClone(principal)),
  });
}

export function resolveTenantIdFromHeaders(headers = {}) {
  const normalized = normalizeHeaders(headers);
  const tenantId = normalized["x-tenant-id"];
  return typeof tenantId === "string" && tenantId.trim()
    ? tenantId.trim()
    : null;
}

export function createDurableApiKeyAuthenticator({
  repository,
  adminKey,
  adminPrincipal = {
    id: "platform-admin",
    name: "Platform Administrator",
    status: "active",
    scopes: ["admin:*"],
  },
  resolveTenantId = resolveTenantIdFromHeaders,
  compareSecrets = secureCompareSecrets,
  verifyHash = verifyApiKeyHash,
} = {}) {
  const apiKeys = requireRepository(repository);
  const resolveTenant = requireFunction(resolveTenantId, "resolveTenantId");
  const compare = requireFunction(compareSecrets, "compareSecrets");
  const verify = requireFunction(verifyHash, "verifyHash");

  return Object.freeze({
    async authenticate(headers = {}) {
      const apiKey = extractApiKey(headers);
      if (!apiKey) return null;

      if (adminKey && compare(apiKey, adminKey)) {
        return freezeIdentity("admin", adminPrincipal);
      }

      const tenantId = await resolveTenant(headers);
      if (typeof tenantId !== "string" || !tenantId.trim()) return null;
      const normalizedTenantId = tenantId.trim();
      const prefix = apiKey.slice(0, 12);

      const record = await apiKeys.getActiveByPrefix(
        normalizedTenantId,
        prefix,
      );

      if (
        !record ||
        record.status !== "active" ||
        record.tenantId !== normalizedTenantId
      ) {
        return null;
      }

      const expectedHash = record.hash ?? record.keyHash;
      if (!verify(apiKey, expectedHash)) return null;

      return freezeIdentity("client", {
        id: record.id,
        tenantId: record.tenantId,
        name: record.name,
        status: record.status,
        scopes: Array.isArray(record.scopes) ? [...record.scopes] : [],
        prefix: record.prefix,
      });
    },
  });
}
