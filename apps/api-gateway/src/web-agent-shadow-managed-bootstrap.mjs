import { createWebAgentShadowOperationalBootstrapOptions } from "./web-agent-shadow-operational-bootstrap.mjs";
import { createWebAgentShadowPersistenceProviders } from "./web-agent-shadow-persistence-providers.mjs";

export function createWebAgentShadowManagedBootstrapOptions({
  operationalRuntime,
  clock,
  fetchImpl,
} = {}) {
  const store = operationalRuntime?.store;
  if (!store) {
    throw new TypeError("operationalRuntime.store is required");
  }

  const providers = createWebAgentShadowPersistenceProviders({ store });

  return createWebAgentShadowOperationalBootstrapOptions({
    operationalRuntime,
    resolveSessionByHash: providers.resolveSessionByHash,
    tenantInternationalProfile: providers.tenantInternationalProfile,
    commercialContext: providers.commercialContext,
    ...(clock ? { clock } : {}),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
}
