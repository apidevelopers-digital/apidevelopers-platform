import { createWebAgentShadowServerDependencies } from "./web-agent-shadow-server-dependencies.mjs";

export function createWebAgentShadowOperationalBootstrapOptions({
  operationalRuntime,
  resolveSessionByHash,
  tenantInternationalProfile,
  commercialContext,
  clock,
  fetchImpl,
} = {}) {
  const store = operationalRuntime?.store;

  if (!store) {
    throw new TypeError("operationalRuntime.store is required");
  }

  const dependencies = createWebAgentShadowServerDependencies({
    store,
    resolveSessionByHash,
    tenantInternationalProfile,
    commercialContext,
    ...(clock ? { clock } : {}),
  });

  return Object.freeze({
    dependencies,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
}
