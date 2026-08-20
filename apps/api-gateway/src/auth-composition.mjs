import {
  createDurableApiKeyAuthenticator,
  extractApiKey,
  secureCompareSecrets,
} from "@apidevelopers/auth-core";

function requireRepository(repository) {
  if (typeof repository?.getActiveByPrefix !== "function") {
    throw new TypeError("apiKeyRepository.getActiveByPrefix must be a function");
  }
  return repository;
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function freezeIdentity(role, principal) {
  return Object.freeze({
    role,
    principal: Object.freeze(structuredClone(principal)),
  });
}

export function createGatewayAuthenticator({
  apiKeyRepository,
  adminKey,
  adminPrincipal,
  resolveTenantId,
  delegatedKey = optionalText(process.env.API_GATEWAY_DELEGATED_KEY),
  delegatedTenantId = optionalText(process.env.API_GATEWAY_DELEGATED_TENANT_ID),
  delegatedPrincipal = {
    id: "backend-delegated",
    name: "Backend Delegated Access",
    status: "active",
    scopes: ["saas:access:delegate"],
  },
  compareSecrets = secureCompareSecrets,
} = {}) {
  const durableAuthenticator = createDurableApiKeyAuthenticator({
    repository: requireRepository(apiKeyRepository),
    adminKey,
    adminPrincipal,
    resolveTenantId,
  });

  const normalizedDelegatedKey = optionalText(delegatedKey);
  const normalizedDelegatedTenantId = optionalText(delegatedTenantId);

  if (Boolean(normalizedDelegatedKey) !== Boolean(normalizedDelegatedTenantId)) {
    throw new TypeError(
      "API_GATEWAY_DELEGATED_KEY and API_GATEWAY_DELEGATED_TENANT_ID must be configured together",
    );
  }

  if (!normalizedDelegatedKey) {
    return durableAuthenticator;
  }

  return Object.freeze({
    async authenticate(headers = {}) {
      const apiKey = extractApiKey(headers);
      if (apiKey && compareSecrets(apiKey, normalizedDelegatedKey)) {
        return freezeIdentity("service", {
          ...delegatedPrincipal,
          tenantId: normalizedDelegatedTenantId,
          scopes: ["saas:access:delegate"],
        });
      }
      return durableAuthenticator.authenticate(headers);
    },
  });
}
