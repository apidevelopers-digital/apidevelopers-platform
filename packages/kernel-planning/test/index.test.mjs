import test from "node:test";
import assert from "node:assert/strict";
import { createPlanningEngine } from "../src/index.mjs";
import {
  runGovernedPlanning,
  createPlanningDecisionHandoff,
} from "../src/governed.mjs";

const clock = () => "2026-07-25T13:00:00.000Z";
const tenantContext = {
  schemaVersion: 1,
  tenantId: "tenant_001",
  tenantIdOpaque: true,
  isolationMode: "strict",
  crossTenantAccessAllowed: false,
  globalOperation: false,
  principalId: "principal.planning",
  requestId: "request.planning.001",
  roles: [],
  permissions: [],
  createdAt: "2026-07-25T12:00:00.000Z",
};
const reflection = (findings = [], extra = {}) => ({
  reflectionId: "reflection.001",
  generatedAt: "2026-07-25T12:00:00.000Z",
  requestedBy: "system",
  scope: "platform",
  tenantId: "tenant_001",
  cycleId: "cycle.001",
  mode: "advisory",
  mutationAllowed: false,
  summary: { status: "review", counts: { total: findings.length } },
  findings,
  ...extra,
});
const engine = () => createPlanningEngine({ clock });

test("requires tenant and cycle and blocks cross-tenant input", () => {
  assert.throws(() => engine().plan(), /tenantId/);
  assert.throws(
    () => engine().plan({
      tenantId: "tenant_other",
      cycleId: "cycle.001",
      reflectionReport: reflection(),
    }),
    /cross-tenant/,
  );
});

test("creates deterministic deeply immutable proposals with traceability", () => {
  const input = reflection([
    {
      ruleId: "RSN-001",
      category: "architecture",
      severity: "medium",
      subject: "component.publisher",
      statement: "Provider is missing.",
      evidence: ["evidence.001"],
    },
    {
      ruleId: "RSN-002",
      category: "architecture",
      severity: "low",
      subject: "component.publisher",
      statement: "Contract review is pending.",
      evidence: ["evidence.002"],
    },
  ]);
  const before = structuredClone(input);
  const first = engine().plan({
    tenantId: "tenant_001",
    cycleId: "cycle.001",
    reflectionReport: input,
  });
  const second = engine().plan({
    tenantId: "tenant_001",
    cycleId: "cycle.001",
    reflectionReport: input,
  });

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(first.proposals.length, 1);
  assert.deepEqual(
    first.proposals[0].sourceReferences,
    ["RSN-001", "RSN-002", "reflection.001"],
  );
  assert.equal(first.proposals[0].alternatives.length, 3);
  assert.equal(first.proposals[0].humanApprovalRequired, true);
  assert.equal(first.mutationAllowed, false);
  assert.equal(first.approvalAllowed, false);
  assert.equal(first.executionAllowed, false);
  assert.equal(Object.isFrozen(first.proposals[0]), true);
});

test("blocks constitutional conflict and requires impact evidence for high risk", () => {
  const report = engine().plan(
    {
      tenantId: "tenant_001",
      cycleId: "cycle.001",
      reflectionReport: reflection([
        {
          ruleId: "RSN-CONSTITUTION",
          severity: "critical",
          subject: "kernel.tenancy",
          statement: "Would weaken tenant isolation.",
          tags: ["weaken-tenant-isolation"],
          evidence: ["evidence.constitution"],
        },
        {
          ruleId: "RSN-HIGH",
          severity: "high",
          subject: "component.high",
          statement: "High risk change.",
          evidence: ["evidence.high"],
        },
      ]),
    },
    { impactAnalysis: { subject: "kernel.tenancy", complete: true } },
  );

  const blocked = report.proposals.find((item) => item.subject === "kernel.tenancy");
  const high = report.proposals.find((item) => item.subject === "component.high");
  assert.equal(blocked.decisionState, "blocked");
  assert.equal(blocked.constitutionalConflict, true);
  assert.ok(high.requiredEvidence.includes("impact-analysis:component.high"));
});

test("uses governed reflection-to-planning and planning-to-decision handoffs", () => {
  const handoff = {
    schemaVersion: 1,
    handoffId: "handoff.reflection.planning.001",
    from: "kernel-reflection",
    to: "kernel-planning",
    cycleId: "cycle.001",
    tenantContext,
    payload: {
      reflectionReport: reflection([
        {
          ruleId: "RSN-LOW",
          severity: "low",
          subject: "component.low",
          statement: "Stable finding.",
          evidence: ["evidence.low"],
        },
      ]),
    },
    createdAt: "2026-07-25T12:30:00.000Z",
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
  };

  const report = runGovernedPlanning({ handoff, engine: engine() });
  assert.equal(report.sourceHandoffId, handoff.handoffId);

  const next = createPlanningDecisionHandoff({
    planningReport: report,
    tenantContext,
    handoffId: "handoff.planning.decision.001",
    createdAt: "2026-07-25T13:01:00.000Z",
  });
  assert.equal(next.from, "kernel-planning");
  assert.equal(next.to, "kernel-decision");
  assert.equal(next.mutationAllowed, false);
});
