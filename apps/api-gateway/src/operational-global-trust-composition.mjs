import {
  createGlobalTrustAdmissionGate,
} from "./global-trust-admission-gate.mjs";
import {
  createGlobalTrustAdmissionGateHttpApp,
} from "./global-trust-admission-gate-http.mjs";
import {
  createGlobalTrustAdmissionGateIntegrity,
} from "./global-trust-admission-gate-integrity.mjs";
import {
  createIncidentQueueOperationalGateway,
} from "./operational-incident-queue-composition.mjs";

const CAPABILITIES = Object.freeze([
  "tenant-context",
  "authorization",
  "audit",
  "risk-engine",
  "human-approval",
  "kill-switch",
  "observability",
  "integrity",
  "tool-invocation-guard",
  "model-registry",
  "use-case-registry",
  "data-policy-registry",
  "prompt-defense",
  "output-validator",
  "incident-queue",
  "admission-gate",
]);

export function createGlobalTrustComposedOperationalGateway({
  admissionDecisionIdFactory,
  admissionNow,
  admissionIntegrityNow,
  admissionProofIdFactory,
  ...incidentQueueOptions
} = {}) {
  const gateway = createIncidentQueueOperationalGateway(incidentQueueOptions);
  const admissionIntegrity = createGlobalTrustAdmissionGateIntegrity({
    store: gateway.store,
    ...(admissionIntegrityNow ? { now: admissionIntegrityNow } : {}),
    ...(admissionProofIdFactory ? { proofIdFactory: admissionProofIdFactory } : {}),
  });
  const admissionGate = createGlobalTrustAdmissionGate({
    store: gateway.store,
    modelRegistry: gateway.modelRegistry,
    useCaseRegistry: gateway.useCaseRegistry,
    dataPolicyRegistry: gateway.dataPolicyRegistry,
    integrity: admissionIntegrity,
    ...(admissionDecisionIdFactory
      ? { decisionIdFactory: admissionDecisionIdFactory }
      : {}),
    ...(admissionNow ? { now: admissionNow } : {}),
  });
  const app = createGlobalTrustAdmissionGateHttpApp({
    app: gateway.app,
    authenticator: gateway.authenticator,
    authorization: gateway.authorization,
    admissionGate,
    integrity: admissionIntegrity,
  });

  return Object.freeze({
    ...gateway,
    admissionIntegrity,
    admissionGate,
    app,
    composition: Object.freeze({
      contractType: "GlobalTrustOperationalComposition",
      contractVersion: "1.1",
      capabilities: CAPABILITIES,
      sharedStore: true,
      inferenceRouteEnabled: false,
      modelExecutionEnabled: false,
      toolExecutionEnabled: false,
      providerContactEnabled: false,
      deploymentExecuted: false,
      automaticRemediationEnabled: false,
    }),
  });
}
