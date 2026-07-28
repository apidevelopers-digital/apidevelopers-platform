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
]);

export function createGlobalTrustComposedOperationalGateway(options = {}) {
  const gateway = createIncidentQueueOperationalGateway(options);

  return Object.freeze({
    ...gateway,
    composition: Object.freeze({
      contractType: "GlobalTrustOperationalComposition",
      contractVersion: "1.0",
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
