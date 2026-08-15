import { createOperationalGateway } from "./operational-composition.mjs";
import { createGlobalTrustToolInvocationGuard } from "./global-trust-tool-invocation-guard.mjs";
import { createGlobalTrustToolInvocationHttpApp } from "./global-trust-tool-invocation-http.mjs";
import { createGlobalTrustToolInvocationIntegrity } from "./global-trust-tool-invocation-integrity.mjs";

export function createToolGuardedOperationalGateway({
  toolInvocationPolicies = [],
  toolInvocationDecisionNow,
  toolInvocationDecisionIdFactory,
  toolInvocationIntegrityNow,
  toolInvocationProofIdFactory,
  ...operationalOptions
} = {}) {
  const base = createOperationalGateway(operationalOptions);

  const toolInvocationIntegrity = createGlobalTrustToolInvocationIntegrity({
    store: base.store,
    ...(toolInvocationIntegrityNow ? { now: toolInvocationIntegrityNow } : {}),
    ...(toolInvocationProofIdFactory
      ? { proofIdFactory: toolInvocationProofIdFactory }
      : {}),
  });

  const toolInvocationGuard = createGlobalTrustToolInvocationGuard({
    store: base.store,
    integrity: toolInvocationIntegrity,
    policies: toolInvocationPolicies,
    ...(toolInvocationDecisionNow ? { now: toolInvocationDecisionNow } : {}),
    ...(toolInvocationDecisionIdFactory
      ? { decisionIdFactory: toolInvocationDecisionIdFactory }
      : {}),
  });

  const app = createGlobalTrustToolInvocationHttpApp({
    app: base.app,
    authenticator: base.authenticator,
    authorization: base.authorization,
    guard: toolInvocationGuard,
  });

  return Object.freeze({
    ...base,
    toolInvocationGuard,
    toolInvocationIntegrity,
    app,
  });
}
