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
  operatorKey = optionalText(process.env.API_GATEWAY_OPERATOR_KEY),
  operatorTenantId = optionalText(process.env.API_GATEWAY_OPERATOR_TENANT_ID),
  operatorPrincipal = {
    id: "institutional-operator",
    name: "Institutional Operator",
    status: "active",
    scopes: ["operator:resource:read"],
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
  const normalizedOperatorKey = optionalText(operatorKey);
  const normalizedOperatorTenantId = optionalText(operatorTenantId);

  if (Boolean(normalizedDelegatedKey) !== Boolean(normalizedDelegatedTenantId)) {
    throw new TypeError(
      "API_GATEWAY_DELEGATED_KEY and API_GATEWAY_DELEGATED_TENANT_ID must be configured together",
    );
  }
  if (Boolean(normalizedOperatorKey) !== Boolean(normalizedOperatorTenantId)) {
    throw new TypeError(
      "API_GATEWAY_OPERATOR_KEY and API_GATEWAY_OPERATOR_TENANT_ID must be configured together",
    );
  }
  if (normalizedProvisioningKey && normalizedProvisioningKey.length < 32) {
    throw new TypeError("API_GATEWAY_PROVISIONING_KEY must contain at least 32 characters");
  }
  if (normalizedOperatorKey && normalizedOperatorKey.length < 32) {
    throw new TypeError("API_GATEWAY_OPERATOR_KEY must contain at least 32 characters");
  }

  const configuredKeys = [
    ["admin", optionalText(adminKey)],
    ["delegated", normalizedDelegatedKey],
    ["provisioning", normalizedProvisioningKey],
    ["operator", normalizedOperatorKey],
  ].filter(([, key]) => Boolean(key));

  for (let left = 0; left < configuredKeys.length; left += 1) {
    for (let right = left + 1; right < configuredKeys.length; right += 1) {
      if (compareSecrets(configuredKeys[left][1], configuredKeys[right][1])) {
        throw new TypeError(
          `${configuredKeys[left][0]} and ${configuredKeys[right][0]} keys must be distinct`,
        );
      }
    }
  }

  if (!normalizedDelegatedKey && !normalizedProvisioningKey && !normalizedOperatorKey) {
    return durableAuthenticator;
  }

  return Object.freeze({
    async authenticate(headers = {}) {
      const apiKey = extractApiKey(headers);
      if (
        apiKey &&
        normalizedProvisioningKey &&
        compareSecrets(apiKey, normalizedProvisioningKey)
      ) {
        return freezeIdentity("service", {
          ...provisioningPrincipal,
          scopes: ["saas:provision"],
        });
      }
      if (
        apiKey &&
        normalizedDelegatedKey &&
        compareSecrets(apiKey, normalizedDelegatedKey)
      ) {
        return freezeIdentity("service", {
          ...delegatedPrincipal,
          tenantId: normalizedDelegatedTenantId,
          scopes: ["saas:access:delegate"],
        });
      }
      if (
        apiKey &&
        normalizedOperatorKey &&
        compareSecrets(apiKey, normalizedOperatorKey)
      ) {
        return freezeIdentity("service", {
          ...operatorPrincipal,
          tenantId: normalizedOperatorTenantId,
          scopes: ["operator:resource:read"],
        });
      }
      return durableAuthenticator.authenticate(headers);
    },
  });
}
