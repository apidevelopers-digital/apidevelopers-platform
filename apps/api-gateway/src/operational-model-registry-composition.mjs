import { createGlobalTrustModelRegistryHttpApp } from "./global-trust-model-registry-http.mjs";
import { createGlobalTrustModelRegistryIntegrity } from "./global-trust-model-registry-integrity.mjs";
import { createGlobalTrustModelRegistry } from "./global-trust-model-registry.mjs";
import { createToolGuardedOperationalGateway } from "./operational-tool-invocation-composition.mjs";

export function createModelRegisteredOperationalGateway({
  modelRegistryNow,
  modelRegistryEventIdFactory,
  modelRegistryIntegrityNow,
  modelRegistryProofIdFactory,
  ...operationalOptions
} = {}) {
  const base = createToolGuardedOperationalGateway(operationalOptions);

  const modelRegistryIntegrity = createGlobalTrustModelRegistryIntegrity({
    store: base.store,
    ...(modelRegistryIntegrityNow ? { now: modelRegistryIntegrityNow } : {}),
    ...(modelRegistryProofIdFactory
      ? { proofIdFactory: modelRegistryProofIdFactory }
      : {}),
  });

  const modelRegistry = createGlobalTrustModelRegistry({
    store: base.store,
    integrity: modelRegistryIntegrity,
    ...(modelRegistryNow ? { now: modelRegistryNow } : {}),
    ...(modelRegistryEventIdFactory
      ? { eventIdFactory: modelRegistryEventIdFactory }
      : {}),
  });

  const app = createGlobalTrustModelRegistryHttpApp({
    app: base.app,
    authenticator: base.authenticator,
    authorization: base.authorization,
    registry: modelRegistry,
    integrity: modelRegistryIntegrity,
  });

  return Object.freeze({
    ...base,
    modelRegistryIntegrity,
    modelRegistry,
    app,
  });
}
