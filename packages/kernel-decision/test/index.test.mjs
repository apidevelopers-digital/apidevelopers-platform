import test from "node:test";
import assert from "node:assert/strict";

import { createDecisionEngine } from "../src/index.mjs";

function engine() {
  return createDecisionEngine({
    clock: () => "2026-07-16T15:30:00.000Z",
  });
}

function plan(proposals) {
  return {
    planningId: "planning.wave3",
    sourceReflectionId: "reasoning.wave3",
    proposals,
  };
}

function proposal(overrides = {}) {
  return {
    proposalId: "proposal.default",
    sourceReflectionId: "reasoning.wave3",
    sourceReferences: ["reasoning.wave3", "RSN-001"],
    subject: "component.publisher",
    category: "architecture",
    priority: "medium",
    rationale: "A governed change is recommended.",
    requiredEvidence: [],
    requiredReviews: [],
    decisionState: "proposed",
    constitutionalConflict: false,
    ...overrides,
  };
}

test("rejects invalid planning reports", () => {
  assert.throws(
    () => engine().evaluate(null),
    /planningReport must be an object/,
  );
  assert.throws(
    () => engine().evaluate({ planningId: "planning.wave3" }),
    /planningReport.proposals must be an array/,
  );
});

test("preserves planning and reflection traceability", () => {
  const report = engine().evaluate(plan([proposal()]));

  assert.equal(report.sourcePlanningId, "planning.wave3");
  assert.equal(report.sourceReflectionId, "reasoning.wave3");
  assert.deepEqual(report.candidates[0].sourceReferences, [
    "reasoning.wave3",
    "RSN-001",
  ]);
});

test("blocks constitutional conflicts", () => {
  const report = engine().evaluate(
    plan([
      proposal({
        proposalId: "proposal.blocked",
        priority: "critical",
        decisionState: "blocked",
        constitutionalConflict: true,
      }),
    ]),
  );

  assert.equal(report.decisionState, "blocked");
  assert.equal(report.recommendation, "reject");
  assert.equal(report.gates.constitutionalConflict, true);
});

test("marks missing evidence", () => {
  const report = engine().evaluate(
    plan([
      proposal({
        requiredEvidence: ["evidence:component.publisher"],
      }),
    ]),
  );

  assert.equal(report.decisionState, "needs-evidence");
  assert.deepEqual(report.gates.missingEvidence, [
    "evidence:component.publisher",
  ]);
  assert.equal(report.recommendation, "defer");
});

test("marks missing reviews after evidence is satisfied", () => {
  const report = engine().evaluate(
    plan([
      proposal({
        requiredEvidence: ["evidence:component.publisher"],
        requiredReviews: ["kernel-governance"],
      }),
    ]),
    {
      evidence: ["evidence:component.publisher"],
    },
  );

  assert.equal(report.decisionState, "needs-review");
  assert.deepEqual(report.gates.missingReviews, ["kernel-governance"]);
});

test("emits readiness without approving or executing", () => {
  const report = engine().evaluate(
    plan([
      proposal({
        requiredEvidence: ["evidence:component.publisher"],
        requiredReviews: ["kernel-governance"],
      }),
    ]),
    {
      evidence: ["evidence:component.publisher"],
      reviews: ["kernel-governance"],
    },
  );

  assert.equal(report.decisionState, "ready-for-human-decision");
  assert.equal(report.recommendation, "submit-for-human-approval");
  assert.equal(report.humanApprovalRequired, true);
  assert.equal(report.approved, false);
  assert.equal(report.mutationAllowed, false);
  assert.equal(report.executionAllowed, false);
  assert.equal(report.constraints.automaticDecisionAllowed, false);
});

test("honors explicit proposal selection", () => {
  const report = engine().evaluate(
    plan([
      proposal({ proposalId: "proposal.a", subject: "component.a" }),
      proposal({ proposalId: "proposal.b", subject: "component.b" }),
    ]),
    { selectedProposalId: "proposal.b" },
  );

  assert.equal(report.selectedProposalId, "proposal.b");
  assert.throws(
    () =>
      engine().evaluate(plan([proposal()]), {
        selectedProposalId: "proposal.missing",
      }),
    /unknown proposal/,
  );
});

test("selects the highest-priority ready candidate deterministically", () => {
  const report = engine().evaluate(
    plan([
      proposal({
        proposalId: "proposal.low",
        subject: "component.low",
        priority: "low",
      }),
      proposal({
        proposalId: "proposal.high",
        subject: "component.high",
        priority: "high",
      }),
    ]),
  );

  assert.equal(report.selectedProposalId, "proposal.high");
  assert.equal(report.candidates[0].proposalId, "proposal.high");
});

test("keeps a higher-priority candidate selected even when it still needs review", () => {
  const report = engine().evaluate(
    plan([
      proposal({
        proposalId: "proposal.medium-ready",
        subject: "component.medium",
        priority: "medium",
      }),
      proposal({
        proposalId: "proposal.critical-review",
        subject: "component.critical",
        priority: "critical",
        requiredReviews: ["kernel-governance"],
      }),
    ]),
  );

  assert.equal(report.selectedProposalId, "proposal.critical-review");
  assert.equal(report.decisionState, "needs-review");
  assert.deepEqual(report.gates.missingReviews, ["kernel-governance"]);
});

test("does not mutate the planning report", () => {
  const input = plan([
    proposal({
      requiredEvidence: ["evidence:component.publisher"],
    }),
  ]);
  const before = structuredClone(input);

  engine().evaluate(input);

  assert.deepEqual(input, before);
});

test("produces stable output for stable input", () => {
  const input = plan([proposal()]);

  assert.deepEqual(engine().evaluate(input), engine().evaluate(input));
});

test("returns no-candidate for an empty governed plan", () => {
  const report = engine().evaluate(plan([]));

  assert.equal(report.decisionState, "no-candidate");
  assert.equal(report.selectedProposalId, null);
  assert.equal(report.recommendation, "defer");
});