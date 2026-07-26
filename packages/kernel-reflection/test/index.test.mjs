import test from "node:test";
import assert from "node:assert/strict";

import {
  ReflectionEngine,
  createReflectionEngine,
  reflectionRules,
} from "../src/index.mjs";

const fixedClock = () => "2026-07-17T00:00:00.000Z";

test("exports the canonical reflection rules", () => {
  assert.deepEqual(Object.keys(reflectionRules), ["REF001", "REF002", "REF003", "REF004"]);
  assert.equal(Object.isFrozen(reflectionRules), true);
});

test("factory creates a ReflectionEngine", () => {
  assert.equal(createReflectionEngine({ clock: fixedClock }) instanceof ReflectionEngine, true);
});

test("rejects invalid snapshots", () => {
  const engine = createReflectionEngine({ clock: fixedClock });
  assert.throws(() => engine.analyze(null), /snapshot must be an object/);
});

test("returns a deterministic advisory report without mutation permission", () => {
  const engine = createReflectionEngine({ clock: fixedClock });
  const snapshot = { nodes: [], relations: [] };

  const report = engine.analyze(snapshot, { scope: "kernel", requestedBy: "test" });

  assert.equal(report.reflectionId, "reflection.20260717000000000");
  assert.equal(report.generatedAt, fixedClock());
  assert.equal(report.scope, "kernel");
  assert.equal(report.requestedBy, "test");
  assert.equal(report.mode, "advisory");
  assert.equal(report.mutationAllowed, false);
  assert.equal(report.summary.status, "healthy");
  assert.deepEqual(report.summary.counts, { total: 0, high: 0, medium: 0, low: 0 });
});

test("detects orphan nodes", () => {
  const report = createReflectionEngine({ clock: fixedClock }).analyze({
    nodes: [{ id: "component.orphan" }],
    relations: [],
  });

  assert.equal(report.findings.some((item) => item.ruleId === "REF-001"), true);
  assert.equal(report.summary.status, "review");
});

test("detects active capabilities without assets as high severity", () => {
  const report = createReflectionEngine({ clock: fixedClock }).analyze({
    nodes: [{ id: "capability.publish", status: "active" }],
    relations: [],
  });

  const finding = report.findings.find((item) => item.ruleId === "REF-002");
  assert.equal(finding.severity, "high");
  assert.equal(report.summary.status, "attention");
});

test("detects assets without evidence", () => {
  const report = createReflectionEngine({ clock: fixedClock }).analyze({
    nodes: [{ id: "asset.publisher", promotionStage: "official" }],
    relations: [],
  });

  const finding = report.findings.find((item) => item.ruleId === "REF-003");
  assert.equal(finding.severity, "high");
});

test("detects active organizations without solutions", () => {
  const report = createReflectionEngine({ clock: fixedClock }).analyze({
    nodes: [{ id: "organization.example", status: "active" }],
    relations: [],
  });

  assert.equal(report.findings.some((item) => item.ruleId === "REF-004"), true);
});

test("does not mutate the input snapshot", () => {
  const snapshot = {
    nodes: [{ id: "capability.publish", status: "active" }],
    relations: [],
  };
  const before = structuredClone(snapshot);

  createReflectionEngine({ clock: fixedClock }).analyze(snapshot);

  assert.deepEqual(snapshot, before);
});

test("does not flag a governed connected graph", () => {
  const report = createReflectionEngine({ clock: fixedClock }).analyze({
    nodes: [
      { id: "capability.publish", status: "active" },
      { id: "asset.publisher", promotionStage: "official" },
      { id: "evidence.publisher-test" },
      { id: "organization.example", status: "active" },
      { id: "solution.example" },
    ],
    relations: [
      { from: "capability.publish", to: "asset.publisher" },
      { from: "asset.publisher", to: "evidence.publisher-test" },
      { from: "organization.example", to: "solution.example" },
    ],
  });

  assert.deepEqual(report.findings, []);
  assert.equal(report.summary.status, "healthy");
});
