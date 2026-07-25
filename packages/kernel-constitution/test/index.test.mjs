import test from "node:test";
import assert from "node:assert/strict";

import {
  ConstitutionEngine,
  constitutionEffects,
  constitutionRiskLevels,
  createConstitutionEngine,
} from "../src/index.mjs";

const clock = () => "2026-07-17T04:00:00.000Z";

function constitution(overrides = {}) {
  return {
    constitutionId: "constitution.global",
    version: "1.0.0",
    status: "active",
    tenantScope: ["*"],
    defaultEffect: "deny",
    rules: [],
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    tenantId: "tenant_001",
    decisionId: "decision.001",
    proposalId: "proposal.001",
    action: {
      name: "publish",
      domain: "platform",
      risk: "R2",
      tags: ["release"],
      authority: ["operator"],
      evidence: ["evidence.001"],
      approvalPresent: true,
      backupPresent: true,
      rollbackPresent: true,
    },
    constitution: constitution({
      rules: [{
        ruleId: "CON-001",
        effect: "require",
        match: { actions: ["publish"] },
        requirements: {
          authority: ["operator"],
          evidence: true,
          approval: true,
          backup: true,
          rollback: true,
        },
      }],
    }),
    ...overrides,
  };
}

test("exports canonical effects and risk levels", () => {
  assert.deepEqual(constitutionEffects, ["allow", "review", "deny"]);
  assert.deepEqual(constitutionRiskLevels, ["R0", "R1", "R2", "R3", "R4", "R5"]);
  assert.equal(Object.isFrozen(constitutionEffects), true);
  assert.equal(Object.isFrozen(constitutionRiskLevels), true);
});

test("factory creates a ConstitutionEngine", () => {
  assert.equal(createConstitutionEngine({ clock }) instanceof ConstitutionEngine, true);
});

test("rejects invalid constructor options", () => {
  assert.throws(() => new ConstitutionEngine({ clock: null }), /clock must be a function/);
});

test("requires governed identifiers and a constitution document", () => {
  const engine = createConstitutionEngine({ clock });
  assert.throws(() => engine.evaluate(), /tenantId must be a non-empty string/);
  assert.throws(
    () => engine.evaluate({ tenantId: "t", decisionId: "d", proposalId: "p", action: "publish" }),
    /constitution must be an object/,
  );
});

test("allows an action when an active scoped requirement rule is satisfied", () => {
  const result = createConstitutionEngine({ clock }).evaluate(input(), {
    requestedBy: "operator",
    scope: "release-candidate",
  });

  assert.equal(result.constitutionDecisionId, "constitution.20260717040000000.1");
  assert.equal(result.effect, "allow");
  assert.equal(result.humanReviewRequired, false);
  assert.equal(result.mutationAllowed, false);
  assert.equal(result.executionAllowed, false);
  assert.deepEqual(result.matchedRuleIds, ["CON-001"]);
  assert.deepEqual(result.requirementFailures, []);
  assert.equal(result.constraints.policyEvaluationStillRequired, true);
  assert.equal(result.constraints.governanceAuthorizationStillRequired, true);
  assert.equal(result.constraints.executionGatewayRequired, true);
});

test("denies inactive constitution versions", () => {
  const data = input();
  data.constitution.status = "draft";
  const result = createConstitutionEngine({ clock }).evaluate(data);

  assert.equal(result.effect, "deny");
  assert.equal(result.reasons.includes("constitution-not-active"), true);
});

test("denies tenants outside the constitution scope", () => {
  const data = input();
  data.constitution.tenantScope = ["tenant_other"];
  const result = createConstitutionEngine({ clock }).evaluate(data);

  assert.equal(result.effect, "deny");
  assert.equal(result.reasons.includes("tenant-out-of-scope"), true);
});

test("explicit deny rules override allow rules", () => {
  const data = input();
  data.constitution.rules.push({
    ruleId: "CON-000",
    effect: "deny",
    match: { tags: [], anyTags: ["release"] },
    statement: "Release is prohibited.",
  });

  const result = createConstitutionEngine({ clock }).evaluate(data);
  assert.equal(result.effect, "deny");
  assert.deepEqual(result.matchedRuleIds, ["CON-000", "CON-001"]);
  assert.equal(result.reasons.includes("rule-deny:CON-000"), true);
});

test("review rules require human review without allowing execution", () => {
  const data = input();
  data.constitution.rules = [{
    ruleId: "CON-002",
    effect: "review",
    match: { minRisk: "R2" },
  }];

  const result = createConstitutionEngine({ clock }).evaluate(data);
  assert.equal(result.effect, "review");
  assert.equal(result.humanReviewRequired, true);
  assert.equal(result.executionAllowed, false);
});

test("missing rule requirements produce review with explicit failures", () => {
  const data = input();
  data.action.approvalPresent = false;
  data.action.rollbackPresent = false;

  const result = createConstitutionEngine({ clock }).evaluate(data);
  assert.equal(result.effect, "review");
  assert.deepEqual(result.requirementFailures, [{
    ruleId: "CON-001",
    requirements: ["approval", "rollback"],
  }]);
  assert.equal(result.reasons.includes("requirements-unmet:CON-001"), true);
});

test("uses the constitutional default effect when no rule matches", () => {
  const data = input();
  data.action.name = "read";
  const result = createConstitutionEngine({ clock }).evaluate(data);

  assert.equal(result.effect, "deny");
  assert.deepEqual(result.matchedRuleIds, []);
  assert.equal(result.reasons.includes("default-effect:deny"), true);
});

test("supports generic domain, tag, and risk matching without embedded business rules", () => {
  const data = input();
  data.action = {
    name: "analyze",
    domain: "health",
    risk: "R4",
    tags: ["sensitive"],
    authority: ["reviewer"],
    evidence: ["evidence.health"],
  };
  data.constitution.rules = [{
    ruleId: "CON-HEALTH",
    effect: "require",
    match: {
      domains: ["health"],
      anyTags: ["sensitive"],
      minRisk: "R4",
    },
    requirements: {
      authority: ["reviewer"],
      evidence: true,
    },
  }];

  const result = createConstitutionEngine({ clock }).evaluate(data);
  assert.equal(result.effect, "allow");
  assert.deepEqual(result.matchedRuleIds, ["CON-HEALTH"]);
});

test("does not mutate inputs and orders matched rules deterministically", () => {
  const data = input();
  data.constitution.rules = [
    { ruleId: "CON-Z", effect: "allow", match: { actions: ["publish"] } },
    { ruleId: "CON-A", effect: "review", match: { actions: ["publish"] } },
  ];
  const before = structuredClone(data);

  const result = createConstitutionEngine({ clock }).evaluate(data);

  assert.deepEqual(data, before);
  assert.deepEqual(result.matchedRuleIds, ["CON-A", "CON-Z"]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.constraints), true);
});
