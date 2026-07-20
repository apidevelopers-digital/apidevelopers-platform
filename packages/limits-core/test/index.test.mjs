import assert from "node:assert/strict";
import test from "node:test";

import {
  LimitsDomainError,
  createLimitAssignment,
  createLimitRule,
  createLimitWindow,
  createLimitsService,
  createMemoryLimitsRepository,
  evaluateLimit,
  resolveLimitRule,
} from "../src/index.mjs";

const at = "2026-07-20T14:35:00.000Z";
const rule = (overrides = {}) => createLimitRule({
  id: "rule-global",
  planId: "plan-pro",
  allowance: 100,
  period: "month",
  mode: "hard",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

test("creates deeply immutable executable rules", () => {
  const value = rule({ metadata: { source: { catalog: "v1" } } });
  assert.equal(value.allowance, 100);
  assert.throws(() => { value.metadata.source.catalog = "v2"; }, TypeError);
  assert.throws(
    () => rule({ allowance: -1 }),
    (error) => error instanceof LimitsDomainError && error.code === "invalid_argument",
  );
});

test("creates UTC hour day and month windows", () => {
  assert.deepEqual(createLimitWindow("hour", at), {
    from: "2026-07-20T14:00:00.000Z",
    to: "2026-07-20T15:00:00.000Z",
    period: "hour",
  });
  assert.deepEqual(createLimitWindow("day", at), {
    from: "2026-07-20T00:00:00.000Z",
    to: "2026-07-21T00:00:00.000Z",
    period: "day",
  });
  assert.deepEqual(createLimitWindow("month", at), {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-08-01T00:00:00.000Z",
    period: "month",
  });
});

test("resolves the most specific effective rule", () => {
  const rules = [
    rule(),
    rule({ id: "rule-api", apiId: "cpf-api", allowance: 50 }),
    rule({ id: "rule-operation", apiId: "cpf-api", operation: "consult", allowance: 10 }),
  ];
  assert.equal(resolveLimitRule(rules, {
    planId: "plan-pro",
    apiId: "cpf-api",
    operation: "consult",
    at,
  }).id, "rule-operation");
  assert.equal(resolveLimitRule(rules, {
    planId: "plan-pro",
    apiId: "cpf-api",
    operation: "status",
    at,
  }).id, "rule-api");
});

test("hard limits block projected usage over allowance", () => {
  const decision = evaluateLimit({ rule: rule(), consumed: 99, requested: 2 });
  assert.equal(decision.allowed, false);
  assert.equal(decision.action, "block");
  assert.equal(decision.exceededBy, 1);
  assert.equal(decision.remainingBefore, 1);
});

test("soft and monitor modes allow overage with explicit actions", () => {
  assert.equal(evaluateLimit({
    rule: rule({ mode: "soft" }),
    consumed: 100,
    requested: 1,
  }).action, "allow_overage");
  assert.equal(evaluateLimit({
    rule: rule({ mode: "monitor" }),
    consumed: 100,
    requested: 1,
  }).action, "allow_monitor");
});

test("repository prioritizes project assignment over tenant assignment", () => {
  const repository = createMemoryLimitsRepository({
    initialAssignments: [
      createLimitAssignment({
        id: "tenant-plan",
        tenantId: "tenant-1",
        planId: "plan-basic",
        startsAt: "2026-01-01T00:00:00.000Z",
      }),
      createLimitAssignment({
        id: "project-plan",
        tenantId: "tenant-1",
        projectId: "project-1",
        planId: "plan-pro",
        startsAt: "2026-02-01T00:00:00.000Z",
      }),
    ],
  });
  assert.equal(repository.getAssignmentFor({
    tenantId: "tenant-1",
    projectId: "project-1",
    at,
  }).id, "project-plan");
  assert.equal(repository.getAssignmentFor({
    tenantId: "tenant-1",
    projectId: "project-2",
    at,
  }).id, "tenant-plan");
});

test("service combines assignment rule window and usage into a decision", () => {
  const calls = [];
  const repository = createMemoryLimitsRepository({
    initialRules: [
      rule({ id: "monthly", allowance: 1000 }),
      rule({
        id: "cpf-consult",
        apiId: "cpf-api",
        operation: "consult",
        allowance: 100,
        mode: "soft",
      }),
    ],
    initialAssignments: [
      createLimitAssignment({
        id: "assignment-1",
        tenantId: "tenant-1",
        projectId: "project-1",
        planId: "plan-pro",
        startsAt: "2026-01-01T00:00:00.000Z",
      }),
    ],
  });
  const service = createLimitsService({
    repository,
    usageProvider(input) {
      calls.push(input);
      return 98;
    },
    clock: () => at,
  });
  const result = service.evaluate({
    tenantId: "tenant-1",
    projectId: "project-1",
    apiId: "cpf-api",
    operation: "consult",
    requested: 5,
  });
  assert.equal(result.rule.id, "cpf-consult");
  assert.equal(result.decision.action, "allow_overage");
  assert.equal(result.decision.exceededBy, 3);
  assert.deepEqual(calls[0].window, {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-08-01T00:00:00.000Z",
    period: "month",
  });
});

test("service fails closed when assignment or rule is absent", () => {
  const service = createLimitsService({
    repository: createMemoryLimitsRepository(),
    usageProvider: () => 0,
    clock: () => at,
  });
  assert.throws(
    () => service.evaluate({ tenantId: "tenant-1" }),
    (error) => error.code === "limit_assignment_not_found",
  );
});
