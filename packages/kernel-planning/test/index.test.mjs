import test from "node:test";
import assert from "node:assert/strict";

import { createPlanningEngine } from "../src/index.mjs";

function engine() {
  return createPlanningEngine({
    clock: () => "2026-07-16T15:00:00.000Z",
  });
}

function reflection(findings, extra = {}) {
  return {
    reasoningId: "reasoning.wave3",
    findings,
    ...extra,
  };
}

test("rejects invalid reflection input", () => {
  assert.throws(() => engine().plan(null), /reflection must be an object/);
  assert.throws(
    () => engine().plan({ reasoningId: "reasoning.wave3" }),
    /reflection.findings must be an array/,
  );
});

test("groups findings by subject and category", () => {
  const report = engine().plan(
    reflection([
      {
        ruleId: "RSN-001",
        category: "architecture",
        severity: "medium",
        subject: "component.publisher",
        statement: "First finding.",
        evidence: ["evidence.1"],
      },
      {
        ruleId: "RSN-002",
        category: "architecture",
        severity: "low",
        subject: "component.publisher",
        statement: "Second finding.",
        evidence: ["evidence.2"],
      },
    ]),
  );

  assert.equal(report.proposals.length, 1);
  assert.equal(report.proposals[0].findings.length, 2);
  assert.equal(report.proposals[0].category, "architecture");
});

test("preserves source reflection references and sorts by priority", () => {
  const report = engine().plan(
    reflection([
      {
        ruleId: "RSN-LOW",
        severity: "low",
        subject: "component.low",
        statement: "Low.",
        evidence: ["evidence.low"],
      },
      {
        ruleId: "RSN-HIGH",
        severity: "high",
        subject: "component.high",
        statement: "High.",
        evidence: ["evidence.high"],
      },
    ]),
    {
      impactAnalysis: { subject: "component.high", complete: true },
    },
  );

  assert.equal(report.sourceReflectionId, "reasoning.wave3");
  assert.equal(report.proposals[0].subject, "component.high");
  assert.equal(report.proposals[0].sourceReflectionId, "reasoning.wave3");
  assert.ok(report.proposals[0].sourceReferences.includes("RSN-HIGH"));
});

test("requires human approval and never permits mutation or execution", () => {
  const report = engine().plan(
    reflection([
      {
        severity: "low",
        subject: "policy.publish",
        statement: "Policy requires attention.",
        evidence: ["evidence.policy"],
      },
    ]),
  );

  assert.equal(report.constraints.humanApprovalRequired, true);
  assert.equal(report.approvalAllowed, false);
  assert.equal(report.mutationAllowed, false);
  assert.equal(report.executionAllowed, false);
  assert.equal(report.proposals[0].humanApprovalRequired, true);
});

test("marks missing evidence explicitly", () => {
  const report = engine().plan(
    reflection([
      {
        severity: "medium",
        subject: "component.publisher",
        statement: "Missing evidence.",
      },
    ]),
  );

  assert.equal(report.proposals[0].decisionState, "needs-evidence");
  assert.ok(
    report.proposals[0].requiredEvidence.includes(
      "evidence:component.publisher",
    ),
  );
});

test("blocks constitutional conflicts", () => {
  const report = engine().plan(
    reflection([
      {
        severity: "critical",
        subject: "kernel.tenancy",
        statement: "Tenant isolation would be weakened.",
        tags: ["weaken-tenant-isolation"],
        evidence: ["evidence.tenancy"],
      },
    ]),
    {
      impactAnalysis: { subject: "kernel.tenancy", complete: true },
    },
  );

  assert.equal(report.proposals[0].constitutionalConflict, true);
  assert.equal(report.proposals[0].decisionState, "blocked");
});

test("does not mutate reflection input", () => {
  const input = reflection([
    {
      severity: "medium",
      subject: "component.publisher",
      statement: "Immutable input.",
      evidence: ["evidence.publisher"],
    },
  ]);
  const before = structuredClone(input);

  engine().plan(input);

  assert.deepEqual(input, before);
});

test("produces stable output for stable input", () => {
  const input = reflection([
    {
      severity: "low",
      subject: "policy.publish",
      statement: "Stable.",
      evidence: ["evidence.policy"],
    },
  ]);

  assert.deepEqual(engine().plan(input), engine().plan(input));
});

test("enforces maximum proposal count", () => {
  const report = engine().plan(
    reflection([
      {
        severity: "low",
        subject: "component.a",
        statement: "A.",
        evidence: ["evidence.a"],
      },
      {
        severity: "low",
        subject: "component.b",
        statement: "B.",
        evidence: ["evidence.b"],
      },
    ]),
    { maxProposals: 1 },
  );

  assert.equal(report.proposals.length, 1);
});

test("exposes deliberate as a governed alias", () => {
  const input = reflection([
    {
      severity: "low",
      subject: "component.a",
      statement: "A.",
      evidence: ["evidence.a"],
    },
  ]);

  assert.deepEqual(engine().deliberate(input), engine().plan(input));
});
