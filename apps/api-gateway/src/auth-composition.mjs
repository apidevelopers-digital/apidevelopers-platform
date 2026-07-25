import { createDurableApiKeyAuthenticator } from "@apidevelopers/auth-core";

function requireRepository(repository) {
  if (typeof repository?.getActiveByPrefix !== "function") {
    throw new TypeError("apiKeyRepository.getActiveByPrefix must be a function");
  }
  return repository;
}

export function createGatewayAuthenticator({
  apiKeyRepository,
  adminKey,
  adminPrincipal,
  resolveTenantId,
} = {}) {
  return createDurableApiKeyAuthenticator({
    repository: requireRepository(apiKeyRepository),
    adminKey,
    adminPrincipal,
    resolveTenantId,
  });
}
