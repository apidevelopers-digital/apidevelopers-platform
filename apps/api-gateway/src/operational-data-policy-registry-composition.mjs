import {
  createGlobalTrustDataPolicyRegistryHttpApp,
} from "./global-trust-data-policy-registry-http.mjs";
import {
  createGlobalTrustDataPolicyRegistryIntegrity,
} from "./global-trust-data-policy-registry-integrity.mjs";
import {
  createGlobalTrustDataPolicyRegistry,
} from "./global-trust-data-policy-registry.mjs";
import {
  createUseCaseRegisteredOperationalGateway,
} from "./operational-use-case-registry-composition.mjs";

export function createDataPolicyRegisteredOperationalGateway({
  dataPolicyRegistryNow,
  dataPolicyRegistryEventIdFactory,
  dataPolicyRegistryIntegrityNow,
  dataPolicyRegistryProofIdFactory,
  ...useCaseRegistryOptions
} = {}) {
  const base = createUseCaseRegisteredOperationalGateway(useCaseRegistryOptions);

  const dataPolicyRegistryIntegrity =
    createGlobalTrustDataPolicyRegistryIntegrity({
      store: base.store,
      ...(dataPolicyRegistryIntegrityNow
        ? { now: dataPolicyRegistryIntegrityNow }
        : {}),
      ...(dataPolicyRegistryProofIdFactory
        ? { proofIdFactory: dataPolicyRegistryProofIdFactory }
        : {}),
    });

  const dataPolicyRegistry = createGlobalTrustDataPolicyRegistry({
    store: base.store,
    integrity: dataPolicyRegistryIntegrity,
    ...(dataPolicyRegistryNow ? { now: dataPolicyRegistryNow } : {}),
    ...(dataPolicyRegistryEventIdFactory
      ? { eventIdFactory: dataPolicyRegistryEventIdFactory }
      : {}),
  });

  const app = createGlobalTrustDataPolicyRegistryHttpApp({
    app: base.app,
    authenticator: base.authenticator,
    authorization: base.authorization,
    registry: dataPolicyRegistry,
    integrity: dataPolicyRegistryIntegrity,
  });

  return Object.freeze({
    ...base,
    dataPolicyRegistryIntegrity,
    dataPolicyRegistry,
    app,
  });
}
