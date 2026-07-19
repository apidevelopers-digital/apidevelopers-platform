import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const namespaceRoot = path.join(
  repositoryRoot,
  "node_modules",
  "@apidevelopers",
);
mkdirSync(namespaceRoot, { recursive: true });

for (const packageName of [
  "contracts",
  "kernel-policy",
  "kernel-runtime",
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
  createDecisionPolicyHandoff,
  createTenantContext,
} = await import("@apidevelopers/contracts");
const {
  createPolicyEngine,
  hashExecutionPlan,
} = await import("@apidevelopers/kernel-policy");
const {
  createGovernedPolicyRuntimeHandoff,
  runGovernedPolicy,
} = await import("@apidevelopers/kernel-policy/governed");
const {
  createRuntimeEngine,
} = await import("@apidevelopers/kernel-runtime");
const {
  runGovernedRuntime,
} = await import("@apidevelopers/kernel-runtime/governed");

const tenantContext = createTenantContext({
  tenantId: "tenant_demo_0001",
  principalId: "principal.operator",
  requestId: "request.pipeline.runtime.0001",
  roles: ["operator"],
  permissions: ["read:cognitive-pipeline"],
  createdAt: "2026-07-19T05:10:00.000Z",
});

const decisionReport = {
  decisionId: "decision.0001",
  generatedAt: "2026-07-19T05:11:00.000Z",
  requestedBy: "principal.operator",
  scope: "tenant",
  sourcePlanningId: "planning.0001",
  sourceReflectionId: "reflection.0001",
  mode: "advisory",
  selectedProposalId: "proposal.0001",
  decisionState: "ready-for-human-decision",
  recommendation: "submit-for-human-approval",
  rationale: "A governed proposal is available.",
  gates: {
    missingEvidence: [],
    missingReviews: [],
    constitutionalConflict: false,
  },
  candidates: [{
    proposalId: "proposal.0001",
    sourceReflectionId: "reflection.0001",
    sourceReferences: [],
    subject: "safe.echo",
    category: "operation",
    priority: "low",
    rationale: "Preview a reversible local action.",
    requiredEvidence: [],
    requiredReviews: [],
    decisionState: "proposed",
    constitutionalConflict: false,
  }],
  humanApprovalRequired: true,
  approved: false,
  mutationAllowed: false,
  executionAllowed: false,
  constraints: {
    automaticDecisionAllowed: false,
    automaticApprovalAllowed: false,
    automaticExecutionAllowed: false,
    traceabilityRequired: true,
    sourceOfTruth: "governed-planning-report",
  },
  cycleId: "cycle.0001",
  tenantId: "tenant_demo_0001",
  sourceHandoffId: "handoff.planning.decision.0001",
};

const executionPlan = {
  planId: "plan.0001",
  generatedAt: "2026-07-19T05:12:00.000Z",
  requestedBy: "principal.operator",
  tenantId: "tenant_demo_0001",
  decisionId: "decision.0001",
  proposalId: "proposal.0001",
  sourcePlanningId: "planning.0001",
  sourceReflectionId: "reflection.0001",
  objective: "Preview a governed echo action.",
  status: "draft",
  mode: "contract-adapter",
  steps: [{
    stepId: "step.0001",
    action: "echo",
    input: { value: 1 },
    risk: "R1",
    dependsOn: [],
    evidenceRequired: [],
  }],
  constraints: {
    humanApprovalRequired: true,
    automaticMutationAllowed: false,
    automaticApprovalAllowed: false,
    automaticExecutionAllowed: false,
    mutationAllowed: false,
    executionAllowed: false,
  },
};

const action = {
  name: "echo",
  risk: "R1",
  tags: [],
  input: { value: 1 },
};

const decisionPolicyHandoff = createDecisionPolicyHandoff({
  handoffId: "handoff.decision.policy.0001",
  cycleId: "cycle.0001",
  tenantContext,
  decisionReport,
  executionPlan,
  action,
  createdAt: "2026-07-19T05:13:00.000Z",
});

test(
  "runs policy -> runtime through public governed boundaries",
  async () => {
    const policyEngine = createPolicyEngine({
      clock: (() => {
        let sequence = 14;
        return () => `2026-07-19T05:${sequence++}:00.000Z`;
      })(),
    });

    let calls = 0;
    const runtimeEngine = createRuntimeEngine({
      clock: (() => {
        let sequence = 20;
        return () => `2026-07-19T05:${sequence++}:00.000Z`;
      })(),
      actions: {
        echo: {
          risk: "R1",
          reversible: true,
          async handler(input) {
            calls += 1;
            return { value: input.value };
          },
        },
      },
    });

    const previewPolicy = runGovernedPolicy({
      handoff: decisionPolicyHandoff,
      engine: policyEngine,
      dryRun: true,
    });

    const previewHandoff = createGovernedPolicyRuntimeHandoff({
      policyDecision: previewPolicy,
      decisionReport,
      executionPlan,
      tenantContext,
      cycleId: "cycle.0001",
      handoffId: "handoff.policy.runtime.preview.0001",
      createdAt: "2026-07-19T05:16:00.000Z",
    });

    const preview = await runGovernedRuntime({
      handoff: previewHandoff,
      engine: runtimeEngine,
    });

    assert.equal(preview.state, "previewed");
    assert.equal(preview.requestedMode, "preview");
    assert.equal(preview.executionAuthorized, false);
    assert.equal(preview.executionObserved, false);
    assert.equal(preview.mutationObserved, false);
    assert.equal(preview.approvalId, null);
    assert.equal(calls, 0);
    assert.equal(preview.evidence.length, 1);

    const approval = {
      approvalId: "approval.0001",
      status: "approved",
      approvedBy: "human.operator",
      tenantId: tenantContext.tenantId,
      action: "echo",
      decisionId: decisionReport.decisionId,
      proposalId: executionPlan.proposalId,
      planHash: hashExecutionPlan(executionPlan),
      expiresAt: "2026-07-20T05:00:00.000Z",
      consumedAt: null,
      used: false,
    };

    const approvedPolicy = runGovernedPolicy({
      handoff: decisionPolicyHandoff,
      engine: policyEngine,
      dryRun: false,
      approval,
    });

    const executionHandoff = createGovernedPolicyRuntimeHandoff({
      policyDecision: approvedPolicy,
      decisionReport,
      executionPlan,
      approval,
      tenantContext,
      cycleId: "cycle.0001",
      handoffId: "handoff.policy.runtime.execute.0001",
      createdAt: "2026-07-19T05:18:00.000Z",
    });

    await assert.rejects(
      () => runGovernedRuntime({
        handoff: executionHandoff,
        engine: runtimeEngine,
      }),
      /explicit execution confirmation is required/,
    );
    assert.equal(calls, 0);

    const executed = await runGovernedRuntime({
      handoff: executionHandoff,
      engine: runtimeEngine,
      confirmation: "EXECUTE_APPROVED_PLAN",
    });

    assert.equal(executed.state, "executed");
    assert.equal(executed.requestedMode, "execute");
    assert.equal(executed.executionAuthorized, true);
    assert.equal(executed.executionObserved, true);
    assert.equal(executed.mutationObserved, true);
    assert.equal(executed.approvalId, approval.approvalId);
    assert.equal(executed.tenantId, tenantContext.tenantId);
    assert.equal(executed.policyDecisionId, approvedPolicy.policyDecisionId);
    assert.equal(calls, 1);
    assert.equal(executed.evidence.length, 1);
  },
);
