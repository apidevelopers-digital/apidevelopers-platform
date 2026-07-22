import test from "node:test";
import assert from "node:assert/strict";

import { createInstitutionalMemory } from "../../packages/kernel-memory/src/index.mjs";
import { createPlanningEngine } from "../../packages/kernel-planning/src/index.mjs";
import { createDecisionEngine } from "../../packages/kernel-decision/src/index.mjs";
import { createRuntimeEngine } from "../../packages/kernel-runtime/src/index.mjs";
import {
  createEvidenceRegistry,
  verifyEvidence,
} from "../../packages/kernel-evidence/src/index.mjs";
import {
  createPolicyEngine,
  hashExecutionPlan,
} from "../../packages/kernel-policy/src/index.mjs";
import { createGuard } from "../../services/guard/src/index.mjs";

const NOW = "2026-07-21T12:00:00.000Z";
const TENANT_ID = "tenant_learning_loop";
const CYCLE_ID = "cycle.learning.0001";

test("closes a governed learning loop from memory to verified lesson", async () => {
  const clock = () => NOW;
  const memory = createInstitutionalMemory({ clock });

  memory.append({
    id: "memory.problem.0001",
    type: "problem",
    subject: "safe-echo",
    cycleId: CYCLE_ID,
    data: {
      statement: "A governed action needs end-to-end proof.",
      severity: "medium",
    },
  });

  const reflection = {
    reflectionId: "reflection.learning.0001",
    findings: [{
      ruleId: "LEARNING-LOOP-001",
      severity: "low",
      subject: "safe-echo",
      statement: "A governed echo action is available for preview.",
      recommendation: "Preview the action and preserve verified evidence.",
      evidence: ["memory.problem.0001"],
    }],
  };

  const planning = createPlanningEngine({ clock }).plan(reflection);
  const decision = createDecisionEngine({ clock }).evaluate(planning);

  assert.equal(decision.decisionState, "ready-for-human-decision");
  assert.equal(decision.executionAllowed, false);

  memory.append({
    id: "memory.plan.0001",
    type: "plan",
    subject: "safe-echo",
    cycleId: CYCLE_ID,
    refs: ["memory.problem.0001"],
    data: planning,
  });

  memory.append({
    id: "memory.decision.0001",
    type: "decision",
    subject: "safe-echo",
    cycleId: CYCLE_ID,
    refs: ["memory.plan.0001"],
    data: decision,
  });

  const plan = {
    planId: "plan.learning.0001",
    decisionId: decision.decisionId,
    proposalId: decision.selectedProposalId,
    steps: [{
      stepId: "step.learning.0001",
      action: "echo",
      input: { message: "learning-loop-preview" },
    }],
  };

  let handlerCalls = 0;
  const runtime = createRuntimeEngine({
    clock,
    actions: {
      echo: {
        risk: "R1",
        reversible: true,
        handler: async () => {
          handlerCalls += 1;
          return { ok: true };
        },
      },
    },
  });

  const evidenceRegistry = createEvidenceRegistry({ clock });
  const guard = createGuard({
    policyEngine: createPolicyEngine({ clock }),
    runtime,
    evidenceRegistry,
    clock,
  });

  const report = await guard.run({
    tenantId: TENANT_ID,
    action: { name: "echo", risk: "R1" },
    decision,
    plan,
    correlationId: CYCLE_ID,
  });

  assert.equal(report.state, "previewed");
  assert.equal(report.runtime.dryRun, true);
  assert.equal(report.policy.planHash, hashExecutionPlan(plan));
  assert.equal(handlerCalls, 0);

  const evidence = evidenceRegistry.list({ tenantId: TENANT_ID });
  assert.equal(evidence.length, 1);
  assert.equal(verifyEvidence(evidence[0]), true);

  memory.append({
    id: "memory.execution.0001",
    type: "execution",
    subject: "safe-echo",
    cycleId: CYCLE_ID,
    refs: ["memory.decision.0001"],
    evidence: [evidence[0].evidenceId],
    data: report,
  });

  memory.append({
    id: "memory.outcome.0001",
    type: "outcome",
    subject: "safe-echo",
    cycleId: CYCLE_ID,
    refs: ["memory.execution.0001"],
    evidence: [evidence[0].evidenceId],
    data: {
      state: report.state,
      mutationObserved: false,
      executionObserved: false,
    },
  });

  memory.append({
    id: "memory.lesson.0001",
    type: "lesson",
    subject: "safe-echo",
    cycleId: CYCLE_ID,
    refs: ["memory.outcome.0001"],
    evidence: [evidence[0].evidenceId],
    data: {
      statement: "Dry-run proves governance without executing or mutating.",
      reusable: true,
    },
  });

  const cycle = memory.cycle(CYCLE_ID);

  assert.equal(cycle.summary.total, 6);
  assert.deepEqual(cycle.summary.byType, {
    problem: 1,
    plan: 1,
    decision: 1,
    execution: 1,
    outcome: 1,
    lesson: 1,
  });
  assert.equal(memory.lessons({ cycleId: CYCLE_ID }).length, 1);
  assert.equal(memory.snapshot().mutationAllowed, false);
});
