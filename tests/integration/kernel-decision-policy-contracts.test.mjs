import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const namespaceRoot = path.join(
  repositoryRoot,
  "node_modules",
  "@apidevelopers",
);
mkdirSync(namespaceRoot, { recursive: true });

for (const packageName of [
  "contracts",
  "kernel-planning",
  "kernel-decision",
  "kernel-policy",
]) {
  const linkPath = path.join(namespaceRoot, packageName);
  if (!existsSync(linkPath)) {
    symlinkSync(
      path.join(repositoryRoot, "packages", packageName),
      linkPath,
      "dir",
    );
  }
}

const {
  adaptPlanningDecisionToExecutionPlan,
  assertPolicyDecisionContract,
  createTenantContext,
} = await import("@apidevelopers/contracts");
const {
  createPlanningDecisionHandoff,
} = await import("@apidevelopers/kernel-planning/governed");
const {
  createDecisionEngine,
} = await import("@apidevelopers/kernel-decision");
const {
  createGovernedDecisionPolicyHandoff,
  runGovernedDecision,
} = await import("@apidevelopers/kernel-decision/governed");
const {
  createPolicyEngine,
} = await import("@apidevelopers/kernel-policy");
const {
  runGovernedPolicy,
} = await import("@apidevelopers/kernel-policy/governed");

const tenantContext = createTenantContext({
  tenantId: "tenant_demo_0001",
  principalId: "principal.operator",
  requestId: "request.pipeline.policy.0001",
  roles: ["operator"],
  permissions: ["read:cognitive-pipeline"],
  createdAt: "2026-07-19T04:10:00.000Z",
});

const planningReport = {
  planningId: "planning.0001",
  sourceReflectionId: "reflection.0001",
  mode: "advisory",
  mutationAllowed: false,
  approvalAllowed: false,
  executionAllowed: false,
  summary: { proposalCount: 1 },
  proposals: [{
    proposalId: "proposal.0001",
    subject: "safe.echo",
    category: "operation",
    priority: "low",
    rationale: "Preview a reversible local action.",
    requiredEvidence: [],
    requiredReviews: [],
    sourceReflectionId: "reflection.0001",
    sourceReferences: [],
  }],
  constraints: {
    automaticMutationAllowed: false,
    automaticApprovalAllowed: false,
    automaticExecutionAllowed: false,
  },
};

test(
  "runs decision -> policy through public governed boundaries",
  () => {
    const planningHandoff = createPlanningDecisionHandoff({
      planningReport,
      tenantContext,
      cycleId: "cycle.0001",
      handoffId: "handoff.planning.decision.0001",
      createdAt: "2026-07-19T04:11:00.000Z",
    });

    const decision = runGovernedDecision({
      handoff: planningHandoff,
      engine: createDecisionEngine({
        clock: () => "2026-07-19T04:12:00.000Z",
      }),
      options: {
        requestedBy: "principal.operator",
        scope: "tenant",
      },
    });

    const executionPlan = adaptPlanningDecisionToExecutionPlan({
      tenantId: tenantContext.tenantId,
      planningReport,
      decision,
      requestedBy: "principal.operator",
    }, {
      clock: () => "2026-07-19T04:13:00.000Z",
      buildSteps: () => [{
        stepId: "step.0001",
        action: "echo",
        input: { message: "preview-only" },
        risk: "R1",
        dependsOn: [],
        evidenceRequired: [],
      }],
    });

    const handoff = createGovernedDecisionPolicyHandoff({
      decisionReport: decision,
      executionPlan,
      action: {
        name: "echo",
        risk: "R1",
        input: { message: "preview-only" },
      },
      tenantContext,
      cycleId: "cycle.0001",
      handoffId: "handoff.decision.policy.0001",
      createdAt: "2026-07-19T04:14:00.000Z",
    });

    const engine = createPolicyEngine({
      clock: () => "2026-07-19T04:15:00.000Z",
    });

    const preview = runGovernedPolicy({
      handoff,
      engine,
      dryRun: true,
    });
    assert.equal(assertPolicyDecisionContract(preview), preview);
    assert.equal(preview.effect, "allow");
    assert.equal(preview.previewAllowed, true);
    assert.equal(preview.approvalRequired, false);
    assert.equal(preview.executionAllowed, false);
    assert.equal(preview.mutationAllowed, false);

    const realRequestWithoutApproval = runGovernedPolicy({
      handoff,
      engine,
      dryRun: false,
    });
    assert.equal(realRequestWithoutApproval.effect, "review");
    assert.equal(realRequestWithoutApproval.approvalRequired, true);
    assert.equal(realRequestWithoutApproval.executionAllowed, false);
    assert.equal(realRequestWithoutApproval.mutationAllowed, false);
    assert.ok(
      realRequestWithoutApproval.reasons.includes("approval-required"),
    );
    assert.equal(
      realRequestWithoutApproval.tenantId,
      tenantContext.tenantId,
    );
    assert.equal(realRequestWithoutApproval.decisionId, decision.decisionId);
    assert.equal(realRequestWithoutApproval.planId, executionPlan.planId);
  },
);
