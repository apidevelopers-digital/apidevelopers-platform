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
  provisioningKey = optionalText(process.env.API_GATEWAY_PROVISIONING_KEY),
  provisioningPrincipal = {
    id: "backend-provisioner",
    name: "Backend SaaS Provisioner",
    status: "active",
    scopes: ["saas:provision"],
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
  const normalizedProvisioningKey = optionalText(provisioningKey);

  if (Boolean(normalizedDelegatedKey) !== Boolean(normalizedDelegatedTenantId)) {
    throw new TypeError(
      "API_GATEWAY_DELEGATED_KEY and API_GATEWAY_DELEGATED_TENANT_ID must be configured together",
    );
  }
  if (normalizedProvisioningKey && normalizedProvisioningKey.length < 32) {
    throw new TypeError("API_GATEWAY_PROVISIONING_KEY must contain at least 32 characters");
  }
  if (
    normalizedDelegatedKey &&
    normalizedProvisioningKey &&
    compareSecrets(normalizedDelegatedKey, normalizedProvisioningKey)
  ) {
    throw new TypeError("delegated and provisioning keys must be distinct");
  }

  if (!normalizedDelegatedKey && !normalizedProvisioningKey) {
    return durableAuthenticator;
  }

  return Object.freeze({
    async authenticate(headers = {}) {
      const apiKey = extractApiKey(headers);
      if (apiKey && normalizedProvisioningKey && compareSecrets(apiKey, normalizedProvisioningKey)) {
        return freezeIdentity("service", {
          ...provisioningPrincipal,
          scopes: ["saas:provision"],
        });
      }
      if (apiKey && normalizedDelegatedKey && compareSecrets(apiKey, normalizedDelegatedKey)) {
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
