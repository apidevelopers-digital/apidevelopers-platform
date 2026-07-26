import test from "node:test";
import assert from "node:assert/strict";

import {
  adaptPlanningDecisionToExecutionPlan,
  createAuditEvolutionHandoff,
  createRuntimeEvidenceHandoff,
  createTenantContext,
} from "@apidevelopers/contracts";
import {
  createInstitutionalMemory,
  createMemoryReasoningHandoff,
} from "@apidevelopers/kernel-memory";
import { createReasoningEngine } from "@apidevelopers/kernel-reasoning";
import { runGovernedReasoning } from "@apidevelopers/kernel-reasoning/governed";
import { createReflectionEngine } from "@apidevelopers/kernel-reflection";
import { runGovernedReflection } from "@apidevelopers/kernel-reflection/governed";
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
import { runGovernedAudit } from "@apidevelopers/kernel-audit/governed";
import { runGovernedEvolution } from "@apidevelopers/kernel-evolution/governed";

const TIMES = Object.freeze({
  memory: "2026-07-26T13:00:00.000Z",
  reasoning: "2026-07-26T13:01:00.000Z",
  reflection: "2026-07-26T13:02:00.000Z",
  planning: "2026-07-26T13:03:00.000Z",
  decision: "2026-07-26T13:04:00.000Z",
  policy: "2026-07-26T13:05:00.000Z",
  runtime: "2026-07-26T13:06:00.000Z",
  audit: "2026-07-26T13:07:00.000Z",
  evolution: "2026-07-26T13:08:00.000Z",
});

const TENANT_ID = "tenant_vertical";
const CYCLE_ID = "cycle.vertical.001";

function buildTenantContext() {
  return createTenantContext({
    tenantId: TENANT_ID,
    principalId: "operator.vertical",
    requestId: "request.vertical.001",
    roles: ["operator"],
    permissions: [
      "kernel.memory.read",
      "kernel.reasoning.read",
      "kernel.reflection.read",
      "kernel.planning.read",
      "kernel.decision.read",
      "kernel.policy.preview",
      "kernel.runtime.preview",
      "kernel.evidence.record",
      "kernel.audit.read",
      "kernel.evolution.read",
    ],
    createdAt: TIMES.memory,
  });
}

test("runs the governed lifecycle from memory through evolution without external execution", async () => {
  const tenantContext = buildTenantContext();
  const memory = createInstitutionalMemory({
    tenantId: TENANT_ID,
    clock: () => TIMES.memory,
  });
  memory.append({
    id: "memory.problem.vertical.001",
    type: "problem",
    subject: "organization.vertical",
    cycleId: CYCLE_ID,
    status: "open",
    data: { summary: "Organization requires a governed solution link." },
    recordedBy: "kernel-vertical-test",
  });

  const knowledgeSnapshot = {
    nodes: [
      {
        id: "organization.vertical",
        kind: "organization",
        status: "active",
      },
    ],
    relations: [],
  };

  const memoryHandoff = createMemoryReasoningHandoff({
    memory,
    knowledgeSnapshot,
    tenantContext,
    cycleId: CYCLE_ID,
    handoffId: "handoff.memory-reasoning.vertical",
    createdAt: TIMES.memory,
  });

  const reasoning = runGovernedReasoning({
    handoff: memoryHandoff,
    engine: createReasoningEngine({ clock: () => TIMES.reasoning }),
    nextHandoffId: "handoff.reasoning-reflection.vertical",
    createdAt: TIMES.reasoning,
  });

  const reflection = runGovernedReflection({
    handoff: reasoning.handoff,
    engine: createReflectionEngine({ clock: () => TIMES.reflection }),
    nextHandoffId: "handoff.reflection-planning.vertical",
    createdAt: TIMES.reflection,
  });

  const planningReport = runGovernedPlanning({
    handoff: reflection.handoff,
    engine: createPlanningEngine({ clock: () => TIMES.planning }),
    options: {
      impactAnalysis: {
        subject: "organization.vertical",
        complete: true,
      },
    },
  });

  assert.equal(planningReport.proposals.length, 1);
  const proposal = planningReport.proposals[0];

  const planningHandoff = createPlanningDecisionHandoff({
    planningReport,
    tenantContext,
    cycleId: CYCLE_ID,
    handoffId: "handoff.planning-decision.vertical",
    createdAt: TIMES.planning,
  });

  const decisionReport = runGovernedDecision({
    handoff: planningHandoff,
    engine: createDecisionEngine({ clock: () => TIMES.decision }),
    options: {
      evidence: proposal.requiredEvidence,
      reviews: proposal.requiredReviews.map((role) => ({
        role,
        status: "approved",
      })),
      requestedBy: "operator.vertical",
    },
  });

  assert.equal(decisionReport.decisionState, "ready-for-human-decision");
  assert.equal(decisionReport.approved, false);

  const executionPlan = adaptPlanningDecisionToExecutionPlan(
    {
      tenantId: TENANT_ID,
      planningReport,
      decision: decisionReport,
      requestedBy: "operator.vertical",
    },
    {
      clock: () => TIMES.decision,
      buildSteps: () => [
        {
          stepId: "step.vertical.preview",
          action: "echo",
          input: { message: "vertical-preview" },
          risk: "R1",
          evidenceRequired: ["runtime-preview"],
        },
      ],
    },
  );

  const action = {
    name: "echo",
    risk: "R1",
    input: { message: "vertical-preview" },
  };

  const decisionHandoff = createDecisionPolicyHandoff({
    decisionReport,
    executionPlan,
    action,
    tenantContext,
    cycleId: CYCLE_ID,
    handoffId: "handoff.decision-policy.vertical",
    createdAt: TIMES.decision,
  });

  const policyDecision = runGovernedPolicy({
    handoff: decisionHandoff,
    engine: createPolicyEngine({ clock: () => TIMES.policy }),
    dryRun: true,
  });

  assert.equal(policyDecision.effect, "allow");
  assert.equal(policyDecision.executionAllowed, false);

  const policyHandoff = createGovernedPolicyRuntimeHandoff({
    policyDecision,
    decisionReport,
    executionPlan,
    tenantContext,
    cycleId: CYCLE_ID,
    handoffId: "handoff.policy-runtime.vertical",
    createdAt: TIMES.policy,
  });

  let externalCalls = 0;
  const runtimeReport = await runGovernedRuntime({
    handoff: policyHandoff,
    engine: createRuntimeEngine({
      clock: () => TIMES.runtime,
      actions: {
        echo: async () => {
          externalCalls += 1;
          return { ok: true };
        },
      },
    }),
  });

  assert.equal(runtimeReport.state, "previewed");
  assert.equal(runtimeReport.executionObserved, false);
  assert.equal(runtimeReport.mutationObserved, false);
  assert.equal(externalCalls, 0);

  const runtimeHandoff = createRuntimeEvidenceHandoff({
    handoffId: "handoff.runtime-evidence.vertical",
    cycleId: CYCLE_ID,
    tenantContext,
    runtimeReport,
    createdAt: TIMES.runtime,
  });
  const evidenceRecord = recordGovernedRuntimeEvidence({
    handoff: runtimeHandoff,
    registry: createEvidenceRegistry({ clock: () => TIMES.runtime }),
    evidenceId: "evidence.runtime.vertical",
  });
  assert.equal(verifyEvidence(evidenceRecord), true);

  const lifecycle = {
    decision: decisionReport,
    plan: {
      ...executionPlan,
      planHash: policyDecision.planHash,
    },
    policyDecision,
    approval: null,
  };
  const auditHandoff = createGovernedEvidenceAuditHandoff({
    handoffId: "handoff.evidence-audit.vertical",
    cycleId: CYCLE_ID,
    tenantContext,
    evidenceRecord,
    lifecycle,
    createdAt: TIMES.audit,
  });
  const auditReport = runGovernedAudit({
    handoff: auditHandoff,
    requestedBy: "operator.vertical",
    scope: "lifecycle",
  });

  assert.equal(auditReport.evidenceVerified, true);
  assert.equal(auditReport.executionAllowed, false);

  const evolutionHandoff = createAuditEvolutionHandoff({
    handoffId: "handoff.audit-evolution.vertical",
    cycleId: CYCLE_ID,
    tenantContext,
    auditReport,
    createdAt: TIMES.evolution,
  });
  const evolutionReport = runGovernedEvolution({
    handoff: evolutionHandoff,
  });

  assert.equal(evolutionReport.auditVerified, true);
  assert.equal(evolutionReport.humanReviewRequired, true);
  assert.equal(evolutionReport.automaticEvolutionAllowed, false);
  assert.equal(evolutionReport.promotionAllowed, false);
  assert.equal(evolutionReport.tenantId, TENANT_ID);
  assert.equal(evolutionReport.cycleId, CYCLE_ID);
});

test("blocks a cross-tenant entry before reasoning", () => {
  const tenantContext = buildTenantContext();
  const foreignMemory = createInstitutionalMemory({
    tenantId: "tenant_foreign",
    clock: () => TIMES.memory,
  });
  foreignMemory.append({
    id: "memory.foreign.001",
    type: "problem",
    subject: "foreign",
    cycleId: CYCLE_ID,
    status: "open",
    recordedBy: "kernel-vertical-test",
  });

  assert.throws(
    () =>
      createMemoryReasoningHandoff({
        memory: foreignMemory,
        knowledgeSnapshot: { nodes: [], relations: [] },
        tenantContext,
        cycleId: CYCLE_ID,
        handoffId: "handoff.cross-tenant.vertical",
        createdAt: TIMES.memory,
      }),
    /cross-tenant memory handoff blocked/,
  );
});
