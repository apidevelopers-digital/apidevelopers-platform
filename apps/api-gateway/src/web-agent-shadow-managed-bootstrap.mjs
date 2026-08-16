import { createWebAgentShadowOperationalBootstrapOptions } from "./web-agent-shadow-operational-bootstrap.mjs";
import { createWebAgentShadowPersistenceProviders } from "./web-agent-shadow-persistence-providers.mjs";
import { createWebAgentShadowMemoryProvider } from "./web-agent-shadow-memory-provider.mjs";

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
  const memoryProvider = createWebAgentShadowMemoryProvider({ store });

  return createWebAgentShadowOperationalBootstrapOptions({
    operationalRuntime,
    resolveSessionByHash: providers.resolveSessionByHash,
    tenantInternationalProfile: providers.tenantInternationalProfile,
    commercialContext: providers.commercialContext,
    memoryProvider,
    ...(clock ? { clock } : {}),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
}
