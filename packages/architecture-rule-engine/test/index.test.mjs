import test from "node:test";
import assert from "node:assert/strict";
import {
  applyExceptions,
  calculateResult,
  hashCanonical,
  mapExitCode,
  runRuleEngine,
  validateEngineInput,
  verifyValidationReport,
} from "../src/index.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const clockValues = [
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
];

function fixedClock() {
  let index = 0;
  return () => clockValues[index++] ?? clockValues.at(-1);
}

function input(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    repository: {
      provider: "github",
      owner: "sitedauni",
      name: "apidevelopers-platform",
      branch: "foundation/global-platform-bootstrap-20260715",
      commitSha: SHA_B,
      workspacePath: ".",
    },
    ruleset: {
      path: "architecture/rulesets/architecture-core.json",
      expectedId: "architecture-core",
      expectedVersion: "1.0.0",
    },
    exceptions: {
      path: "architecture/exceptions/snapshot.json",
      required: false,
    },
    scope: {
      mode: "changed-files",
      baseSha: SHA_A,
      headSha: SHA_B,
      include: ["**"],
      exclude: ["node_modules/**"],
    },
    execution: {
      mode: "ci",
      failThreshold: "ERROR",
      parallelism: 1,
      timeoutMs: 300000,
    },
    outputs: {
      directory: "artifacts/architecture",
      json: true,
      markdown: true,
      sarif: true,
    },
    ...overrides,
  };
}

function ruleset(rules = []) {
  return {
    rulesetId: "architecture-core",
    version: "1.0.0",
    schemaVersion: "1.0.0",
    rules,
  };
}

function rule(overrides = {}) {
  return {
    ruleId: "ARC-TEST-001",
    ruleVersion: "1.0.0",
    type: "test",
    severity: "ERROR",
    enabled: true,
    message: "Architecture rule failed.",
    remediation: "Correct the tested artifact.",
    sourceRefs: ["docs/architecture/RULE_ENGINE_SPEC.md"],
    ...overrides,
  };
}

test("validates the canonical input contract", () => {
  assert.equal(validateEngineInput(input()).valid, true);
  const invalid = validateEngineInput(input({
    repository: { provider: "github" },
  }));
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.path === "$.repository.commitSha"));
});

test("blocks secret-like fields and unsafe output traversal", () => {
  const value = input();
  value.outputs.directory = "../outside";
  value.metadata = { api_token: "blocked" };
  const result = validateEngineInput(value);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "SECRET_LIKE_FIELD"));
  assert.ok(result.errors.some((error) => error.code === "UNSAFE_PATH"));
});

test("calculates all canonical result states", () => {
  const openError = [{ severity: "ERROR", status: "OPEN" }];
  const exceptedError = [{ severity: "ERROR", status: "EXCEPTED" }];
  assert.equal(calculateResult(), "COMPLIANT");
  assert.equal(calculateResult({ findings: exceptedError }), "CONDITIONAL");
  assert.equal(calculateResult({ findings: openError }), "NON_COMPLIANT");
  assert.equal(calculateResult({ invalid: true }), "INVALID");
  assert.equal(calculateResult({ incomplete: true }), "INCOMPLETE");
});

test("maps canonical exit codes", () => {
  assert.equal(mapExitCode("COMPLIANT"), 0);
  assert.equal(mapExitCode("CONDITIONAL"), 0);
  assert.equal(mapExitCode("NON_COMPLIANT"), 1);
  assert.equal(mapExitCode("INVALID"), 2);
  assert.equal(mapExitCode("INCOMPLETE"), 3);
});

test("matches only active, exact and non-expired exceptions", () => {
  const finding = {
    findingId: "f",
    fingerprint: hashCanonical("f"),
    ruleId: "ARC-TEST-001",
    ruleVersion: "1.0.0",
    severity: "ERROR",
    status: "OPEN",
    message: "",
    path: "packages/example/package.json",
    location: { line: null, column: null },
    observed: null,
    expected: null,
    remediation: "",
    sourceRefs: [],
    exception: null,
    metadata: {},
  };
  const exceptions = [{
    exceptionId: "EXC-1",
    status: "active",
    ruleIds: ["ARC-TEST-001"],
    paths: ["packages/example/package.json"],
    owner: "architecture",
    approver: "platform-authority",
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-08-01T00:00:00.000Z",
  }];
  const covered = applyExceptions([finding], exceptions, {
    evaluatedAt: "2026-07-20T12:00:00.000Z",
    repository: {
      fullName: "sitedauni/apidevelopers-platform",
      branch: "foundation/global-platform-bootstrap-20260715",
    },
  });
  assert.equal(covered[0].status, "EXCEPTED");
  const expired = applyExceptions([finding], exceptions, {
    evaluatedAt: "2026-08-01T00:00:00.000Z",
    repository: {
      fullName: "sitedauni/apidevelopers-platform",
      branch: "foundation/global-platform-bootstrap-20260715",
    },
  });
  assert.equal(expired[0].status, "OPEN");
});

test("runs a compliant deterministic pipeline and verifies report integrity", async () => {
  const options = {
    ruleset: ruleset([rule()]),
    resolvedFiles: ["packages/z/package.json", "./packages/a/package.json"],
    adapters: {
      test: async () => [],
    },
  };
  const first = await runRuleEngine(input(), {
    ...options,
    clock: fixedClock(),
  });
  const second = await runRuleEngine(input(), {
    ...options,
    clock: fixedClock(),
  });
  assert.equal(first.summary.result, "COMPLIANT");
  assert.equal(first.execution.exitCode, 0);
  assert.deepEqual(first.scope.resolvedFiles, [
    "packages/a/package.json",
    "packages/z/package.json",
  ]);
  assert.deepEqual(first, second);
  assert.equal(verifyValidationReport(first), true);
});

test("returns NON_COMPLIANT for an uncovered blocking finding", async () => {
  const report = await runRuleEngine(input(), {
    ruleset: ruleset([rule()]),
    resolvedFiles: ["packages/example/package.json"],
    adapters: {
      test: async () => [{
        path: "packages/example/package.json",
        observed: "invalid",
        expected: "valid",
      }],
    },
    clock: fixedClock(),
  });
  assert.equal(report.summary.result, "NON_COMPLIANT");
  assert.equal(report.execution.exitCode, 1);
  assert.equal(report.findings[0].severity, "ERROR");
  assert.equal(report.findings[0].status, "OPEN");
});

test("returns CONDITIONAL when every blocking finding is excepted", async () => {
  const report = await runRuleEngine(input(), {
    ruleset: ruleset([rule()]),
    resolvedFiles: ["packages/example/package.json"],
    adapters: {
      test: async () => [{
        path: "packages/example/package.json",
        observed: "legacy",
        expected: "canonical",
      }],
    },
    exceptions: [{
      exceptionId: "EXC-ARCH-0001",
      status: "active",
      ruleIds: ["ARC-TEST-001"],
      paths: ["packages/example/package.json"],
      owner: "kernel-migration",
      approver: "platform-architecture",
      effectiveFrom: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-08-15T00:00:00.000Z",
    }],
    clock: fixedClock(),
  });
  assert.equal(report.summary.result, "CONDITIONAL");
  assert.equal(report.findings[0].status, "EXCEPTED");
});

test("returns INVALID for unsupported required rule semantics", async () => {
  const report = await runRuleEngine(input(), {
    ruleset: ruleset([rule({ type: "unknown" })]),
    clock: fixedClock(),
  });
  assert.equal(report.summary.result, "INVALID");
  assert.equal(report.execution.exitCode, 2);
});

test("returns INCOMPLETE when a deterministic adapter crashes", async () => {
  const report = await runRuleEngine(input(), {
    ruleset: ruleset([rule()]),
    adapters: {
      test: async () => {
        throw new Error("controlled failure");
      },
    },
    clock: fixedClock(),
  });
  assert.equal(report.summary.result, "INCOMPLETE");
  assert.equal(report.execution.exitCode, 3);
  assert.match(report.findings[0].message, /controlled failure/);
});

test("orders findings deterministically by severity then identity", async () => {
  const report = await runRuleEngine(input(), {
    ruleset: ruleset([
      rule({ ruleId: "ARC-B", severity: "WARN" }),
      rule({ ruleId: "ARC-A", severity: "CRITICAL" }),
    ]),
    adapters: {
      test: async ({ rule: current }) => [{
        path: `packages/${current.ruleId}/package.json`,
      }],
    },
    clock: fixedClock(),
  });
  assert.deepEqual(report.findings.map((finding) => finding.ruleId), [
    "ARC-A",
    "ARC-B",
  ]);
});
