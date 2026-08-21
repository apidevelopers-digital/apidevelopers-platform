import { randomUUID } from "node:crypto";

import {
  assertTenantContextContract,
  createCognitiveHandoff,
  createRuntimeEvidenceHandoff,
} from "@apidevelopers/contracts";
import { createPlanningEngine } from "@apidevelopers/kernel-planning";
import {
  createPlanningDecisionHandoff,
  runGovernedPlanning,
} from "@apidevelopers/kernel-planning/governed";
import { createDecisionEngine } from "@apidevelopers/kernel-decision";
import {
  createDecisionPolicyHandoff,
  runGovernedDecision,
} from "@apidevelopers/kernel-decision/governed";
import {
  createPolicyEngine,
  hashExecutionPlan,
} from "@apidevelopers/kernel-policy";
import {
  createGovernedPolicyRuntimeHandoff,
  runGovernedPolicy,
} from "@apidevelopers/kernel-policy/governed";
import { createRuntimeEngine } from "@apidevelopers/kernel-runtime";
import { runGovernedRuntime } from "@apidevelopers/kernel-runtime/governed";
import {
  createEvidenceRegistry,
  verifyEvidence,
} from "@apidevelopers/kernel-evidence";
import {
  createGovernedEvidenceAuditHandoff,
  recordGovernedRuntimeEvidence,
} from "@apidevelopers/kernel-evidence/governed";
import { createAuditEngine } from "@apidevelopers/kernel-audit";
import { runGovernedAudit } from "@apidevelopers/kernel-audit/governed";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name}_required`);
  return normalized;
}

function assertSandboxVerification(verification, tenantId) {
  if (!verification || typeof verification !== "object" || Array.isArray(verification)) {
    throw new TypeError("verification_required");
  }
  const verificationId = requireText(verification.verificationId, "verificationId");
  if (verification.tenantId !== tenantId) throw new Error("cross_tenant_verification_blocked");
  if (verification.environment !== "sandbox") throw new Error("trust_governance_requires_sandbox");
  if (verification.mode !== "mock") throw new Error("trust_governance_requires_mock_verification");
  if (verification.adapter !== "none") throw new Error("trust_governance_real_adapter_blocked");
  if (verification.biometricProcessing !== false) {
    throw new Error("trust_governance_biometric_processing_blocked");
  }
  if (verification.result !== null) throw new Error("trust_governance_result_must_be_null");
  return verificationId;
}

function createIdFactory(idFactory) {
  if (typeof idFactory !== "function") throw new TypeError("idFactory_function_required");
  return (prefix) => `${prefix}.${requireText(idFactory(), "generatedId")}`;
}

function buildReflectionReport({ verification, tenantContext, cycleId, reflectionId, createdAt }) {
  return deepFreeze({
    reflectionId,
    generatedAt: createdAt,
    requestedBy: tenantContext.principalId,
    scope: "trust-sandbox-verification",
    tenantId: tenantContext.tenantId,
    cycleId,
    mode: "advisory",
    mutationAllowed: false,
    summary: {
      status: "review",
      counts: { total: 1 },
    },
    findings: [
      {
        ruleId: "TRUST-SANDBOX-GOVERNANCE-PREVIEW",
        category: "trust-verification",
        severity: "low",
        subject: `trust.verification.${verification.modality}`,
        statement: "Sandbox verification requires governed decision, evidence and audit preview.",
        evidence: [verification.verificationId],
        tags: ["sandbox", "mock", "no-biometric-processing"],
      },
    ],
  });
}

function buildExecutionPlan({
  decisionReport,
  planningReport,
  verification,
  tenantContext,
  cycleId,
  planId,
  stepId,
}) {
  const proposalId = requireText(decisionReport.selectedProposalId, "selectedProposalId");
  return deepFreeze({
    planId,
    decisionId: decisionReport.decisionId,
    proposalId,
    tenantId: tenantContext.tenantId,
    cycleId,
    sourcePlanningId: planningReport.planningId,
    sourceReflectionId: planningReport.sourceReflectionId,
    objective: "Preview governed Trust decision/evidence/audit lifecycle without execution.",
    status: "draft",
    mode: "contract-adapter",
    steps: [
      {
        stepId,
        action: "trust-sandbox-governance-preview",
        input: {
          verificationId: verification.verificationId,
          modality: verification.modality,
        },
        risk: "R1",
        dependsOn: [],
        evidenceRequired: [verification.verificationId],
      },
    ],
    constraints: {
      humanApprovalRequired: true,
      automaticMutationAllowed: false,
      automaticApprovalAllowed: false,
      automaticExecutionAllowed: false,
      mutationAllowed: false,
      executionAllowed: false,
    },
  });
}

export async function runTrustGovernancePreview({
  verification,
  tenantContext,
  clock = () => new Date().toISOString(),
  idFactory = randomUUID,
} = {}) {
  assertTenantContextContract(tenantContext);
  const verificationId = assertSandboxVerification(verification, tenantContext.tenantId);
  if (typeof clock !== "function") throw new TypeError("clock_function_required");

  const nextId = createIdFactory(idFactory);
  const createdAt = requireText(clock(), "createdAt");
  const cycleId = nextId("trust-cycle");
  const roundTripId = nextId("trust-governance-preview");

  const reflectionReport = buildReflectionReport({
    verification,
    tenantContext,
    cycleId,
    reflectionId: nextId("trust-reflection"),
    createdAt,
  });

  const reflectionPlanningHandoff = createCognitiveHandoff({
    handoffId: nextId("handoff.reflection-planning"),
    from: "kernel-reflection",
    to: "kernel-planning",
    cycleId,
    tenantContext,
    payload: { reflectionReport },
    createdAt,
  });

  const planningReport = runGovernedPlanning({
    handoff: reflectionPlanningHandoff,
    engine: createPlanningEngine({ clock }),
  });

  const planningDecisionHandoff = createPlanningDecisionHandoff({
    planningReport,
    tenantContext,
    cycleId,
    handoffId: nextId("handoff.planning-decision"),
    createdAt,
  });

  const decisionReport = runGovernedDecision({
    handoff: planningDecisionHandoff,
    engine: createDecisionEngine({ clock }),
  });

  const executionPlan = buildExecutionPlan({
    decisionReport,
    planningReport,
    verification,
    tenantContext,
    cycleId,
    planId: nextId("trust-plan"),
    stepId: nextId("trust-step"),
  });

  const action = deepFreeze({
    name: "trust-sandbox-governance-preview",
    risk: "R1",
    tags: ["sandbox", "preview"],
    input: {
      verificationId,
      modality: verification.modality,
    },
  });

  const decisionPolicyHandoff = createDecisionPolicyHandoff({
    decisionReport,
    executionPlan,
    action*,
    tenantContext,
    cycleId,
   handoffId: nextId("handoff.decision-policy"),
    createdAt,
  });

  const policyDecision = runGovernedPolicy({
    handoff: decisionPolicyHandoff,
    engine: createPolicyEngine({ clock }),
    dryRun: true,
    context: {
      trust: true,
      environment: "sandbox",
      requestedMode: "preview",
    },
  });

  const policyRuntimeHandoff = createGovernedPolicyRuntimeHandoff({
    policyDecision,
    decisionReport,
    executionPlan,
    approval: null,
    tenantContext,
    cycleId,
    handoffId: nextId("handoff.policy-runtime"),
    createdAt,
  });

  let actionCalls = 0;
  const runtimeEngine = createRuntimeEngine({
    clock,
    actions: {
      "trust-sandbox-governance-preview": async () => {
        actionCalls += 1;
        throw new Error("trust_preview_action_execution_blocked");
      },
    },
  });

  const runtimeReport = await runGovernedRuntime({
    handoff: policyRuntimeHandoff,
    engine: runtimeEngine,
    mode: "preview",
    confirmation: null,
  });

  if (actionCalls !== 0 || runtimeReport.executionObserved !== false || runtimeReport.mutationObserved !== false) {
    throw new Error("trust_preview_execution_invariant_failed");
  }

  const runtimeEvidenceHandoff = createRuntimeEvidenceHandoff({
    handoffId: nextId("handoff.runtime-evidence"),
    cycleId,
    tenantContext,
    runtimeReport,
    createdAt,
  });

  const evidenceRecord = recordGovernedRuntimeEvidence({
    handoff: runtimeEvidenceHandoff,
    registry: createEvidenceRegistry({ clock }),
    evidenceId: nextId("trust-evidence"),
  });

  const planForAudit = deepFreeze({
    ...executionPlan,
    planHash: policyDecision.planHash ?? hashExecutionPlan(executionPlan),
  });

  const lifecycle = deepFreeze({
    decision: decisionReport,
    plan: planForAudit,
    policyDecision,
    approval: null,
  });

  const evidenceAuditHandoff = createGovernedEvidenceAuditHandoff({
    handoffId: nextId("handoff.evidence-audit"),
    cycleId,
    tenantContext,
    evidenceRecord,
    lifecycle,
    createdAt,
  });

  const auditReport = runGovernedAudit({
    handoff: evidenceAuditHandoff,
    engine: createAuditEngine({ clock, verifyEvidence }),
    requestedBy: tenantContext.principalId,
    scope: "trust-sandbox-governance-preview",
  });

  if (auditReport.evidenceVerified !== true) {
    throw new Error("trust_preview_evidence_verification_failed");
  }

  return deepFreeze({
    roundTripId,
    verificationId,
    tenantId: tenantContext.tenantId,
    cycleId,
    environment: "sandbox",
    mode: "preview",
    realBiometrics: false,
    executionObserved: false,
    mutationObserved: false,
    reflectionReport,
    planningReport,
    decisionReport,
    executionPlan: planForAudit,
    policyDecision,
    runtimeReport,
    evidenceRecord,
    auditReport,
    createdAt,
  });
}
