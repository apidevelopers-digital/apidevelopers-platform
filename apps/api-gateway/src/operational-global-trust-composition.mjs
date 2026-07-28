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
  createGlobalTrustSafetySimulation,
} from "./global-trust-safety-simulation.mjs";
import {
  createGlobalTrustSafetySimulationHttpApp,
} from "./global-trust-safety-simulation-http.mjs";
import {
  createGlobalTrustSafetySimulationIntegrity,
} from "./global-trust-safety-simulation-integrity.mjs";
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
  "safety-simulation",
]);

export function createGlobalTrustComposedOperationalGateway({
  admissionDecisionIdFactory,
  admissionNow,
  admissionIntegrityNow,
  admissionProofIdFactory,
  simulationIdFactory,
  simulationNow,
  simulationIntegrityNow,
  simulationProofIdFactory,
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
  const admissionApp = createGlobalTrustAdmissionGateHttpApp({
    app: gateway.app,
    authenticator: gateway.authenticator,
    authorization: gateway.authorization,
    admissionGate,
    integrity: admissionIntegrity,
  });

  const safetySimulationIntegrity = createGlobalTrustSafetySimulationIntegrity({
    store: gateway.store,
    ...(simulationIntegrityNow ? { now: simulationIntegrityNow } : {}),
    ...(simulationProofIdFactory
      ? { proofIdFactory: simulationProofIdFactory }
      : {}),
  });
  const safetySimulation = createGlobalTrustSafetySimulation({
    store: gateway.store,
    admissionGate,
    promptDefense: gateway.promptDefense,
    outputValidator: gateway.outputValidator,
    toolInvocationGuard: gateway.toolInvocationGuard,
    incidentQueue: gateway.incidentQueue,
    integrity: safetySimulationIntegrity,
    ...(simulationIdFactory ? { simulationIdFactory } : {}),
    ...(simulationNow ? { now: simulationNow } : {}),
  });
  const app = createGlobalTrustSafetySimulationHttpApp({
    app: admissionApp,
    authenticator: gateway.authenticator,
    authorization: gateway.authorization,
    simulation: safetySimulation,
    integrity: safetySimulationIntegrity,
  });

  return Object.freeze({
    ...gateway,
    admissionIntegrity,
    admissionGate,
    safetySimulationIntegrity,
    safetySimulation,
    app,
    composition: Object.freeze({
      contractType: "GlobalTrustOperationalComposition",
      contractVersion: "1.2",
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
