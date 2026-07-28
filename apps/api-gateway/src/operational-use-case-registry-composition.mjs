import {
  createGlobalTrustUseCaseRegistryHttpApp,
} from "./global-trust-use-case-registry-http.mjs";
import {
  createGlobalTrustUseCaseRegistryIntegrity,
} from "./global-trust-use-case-registry-integrity.mjs";
import {
  createGlobalTrustUseCaseRegistry,
} from "./global-trust-use-case-registry.mjs";
import {
  createModelRegisteredOperationalGateway,
} from "./operational-model-registry-composition.mjs";

export function createUseCaseRegisteredOperationalGateway({
  useCaseRegistryNow,
  useCaseRegistryEventIdFactory,
  useCaseRegistryIntegrityNow,
  useCaseRegistryProofIdFactory,
  ...modelRegistryOptions
} = {}) {
  const base = createModelRegisteredOperationalGateway(modelRegistryOptions);

  const useCaseRegistryIntegrity =
    createGlobalTrustUseCaseRegistryIntegrity({
      store: base.store,
      ...(useCaseRegistryIntegrityNow
        ? { now: useCaseRegistryIntegrityNow }
        : {}),
      ...(useCaseRegistryProofIdFactory
        ? { proofIdFactory: useCaseRegistryProofIdFactory }
        : {}),
    });

  const useCaseRegistry = createGlobalTrustUseCaseRegistry({
    store: base.store,
    modelRegistry: base.modelRegistry,
    integrity: useCaseRegistryIntegrity,
    ...(useCaseRegistryNow ? { now: useCaseRegistryNow } : {}),
    ...(useCaseRegistryEventIdFactory
      ? { eventIdFactory: useCaseRegistryEventIdFactory }
      : {}),
  });

  const app = createGlobalTrustUseCaseRegistryHttpApp({
    app: base.app,
    authenticator: base.authenticator,
    authorization: base.authorization,
    registry: useCaseRegistry,
    integrity: useCaseRegistryIntegrity,
  });

  return Object.freeze({
    ...base,
    useCaseRegistryIntegrity,
    useCaseRegistry,
    app,
  });
}
