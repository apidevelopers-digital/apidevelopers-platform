import test from "node:test";
import assert from "node:assert/strict";

import {
  createMemoryRepository,
  normalizeRepositoryPath,
  resolveScope,
} from "../src/repository.mjs";
import {
  RuleEngineLoadError,
  loadExceptionSnapshot,
  loadRuleEngineRuntime,
  loadRuleset,
} from "../src/loaders.mjs";
import {
  createBuiltinAdapters,
} from "../src/adapters.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function canonicalRuleset(rules = []) {
  return {
    rulesetId: "architecture-core",
    name: "Architecture Core Rules",
    version: "1.0.0",
    status: "active",
    scope: "platform",
    sourceRefs: ["docs/architecture/CANONICAL_RULESET_SPEC.md"],
    effectiveFrom: "2026-07-21",
    owner: "platform-architecture",
    defaultSeverity: "ERROR",
    rules,
  };
}

function rule(overrides = {}) {
  return {
    ruleId: "ARC-TEST-001",
    ruleVersion: "1.0.0",
    title: "Test rule",
    description: "A deterministic test rule.",
    category: "documentation-integrity",
    type: "required-path",
    severity: "ERROR",
    status: "active",
    appliesTo: {
      include: ["**"],
      exclude: [],
    },
    parameters: {
      paths: ["scripts/apid.mjs"],
    },
    message: "Required path is missing.",
    remediation: "Create the canonical path.",
    sourceRefs: ["docs/architecture/CANONICAL_RULESET_SPEC.md"],
    ...overrides,
  };
}

function input() {
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
      path: "architecture/rulesets/architecture-core.v1.json",
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
  };
}

test("normalizes paths and rejects traversal", () => {
  assert.equal(normalizeRepositoryPath("./packages\\example\\package.json"), "packages/example/package.json");
  assert.throws(() => normalizeRepositoryPath("../outside"), {
    code: "UNSAFE_PATH",
  });
});

test("memory repository rejects duplicate normalized paths", () => {
  assert.throws(
    () => createMemoryRepository([
      { path: "./a.json", content: "{}" },
      { path: "a.json", content: "{}" },
    ]),
    { code: "DUPLICATE_PATH" },
  );
});

test("changed-files scope is normalized, filtered and sorted", async () => {
  const repository = createMemoryRepository({
    "packages/z/package.json": "{}",
    "packages/a/package.json": "{}",
    "node_modules/x/index.js": "",
  });

  const resolved = await resolveScope({
    mode: "changed-files",
    baseSha: SHA_A,
    headSha: SHA_B,
    include: ["packages/**"],
    exclude: ["**/z/**"],
  }, {
    listFiles: repository.listFiles,
    changedFiles: [
      "./packages/z/package.json",
      "packages/a/package.json",
      "packages/a/package.json",
      "missing.json",
    ],
  });

  assert.deepEqual(resolved, ["packages/a/package.json"]);
});

test("loader validates identity and maps lifecycle to enabled", async () => {
  const document = canonicalRuleset([
    rule({ ruleId: "ARC-B", status: "draft" }),
    rule({ ruleId: "ARC-A", status: "active" }),
    rule({ ruleId: "ARC-C", status: "retired" }),
  ]);

  const repository = createMemoryRepository({
    "architecture/rulesets/architecture-core.v1.json": JSON.stringify(document),
  });

  const loaded = await loadRuleset({
    path: "architecture/rulesets/architecture-core.v1.json",
    expectedId: "architecture-core",
    expectedVersion: "1.0.0",
  }, repository);

  assert.deepEqual(
    loaded.ruleset.rules.map(({ ruleId, enabled }) => ({ ruleId, enabled })),
    [
      { ruleId: "ARC-A", enabled: true },
      { ruleId: "ARC-B", enabled: false },
      { ruleId: "ARC-C", enabled: false },
    ],
  );
});

test("loader rejects mismatched ruleset identity", async () => {
  const repository = createMemoryRepository({
    "architecture/rulesets/architecture-core.v1.json": JSON.stringify(
      canonicalRuleset([rule()]),
    ),
  });

  await assert.rejects(
    loadRuleset({
      path: "architecture/rulesets/architecture-core.v1.json",
      expectedId: "other-ruleset",
      expectedVersion: "1.0.0",
    }, repository),
    (error) =>
      error instanceof RuleEngineLoadError &&
      error.code === "INVALID_RULESET" &&
      error.details.errors.some((item) => item.code === "RULESET_ID_MISMATCH"),
  );
});

test("optional exception snapshot absence is explicit and non-fatal", async () => {
  const repository = createMemoryRepository({});
  const loaded = await loadExceptionSnapshot({
    path: "architecture/exceptions/snapshot.json",
    required: false,
  }, repository);

  assert.equal(loaded.status, "MISSING_OPTIONAL");
  assert.deepEqual(loaded.exceptions, []);
});

test("runtime loads rules, optional exceptions and deterministic scope", async () => {
  const ruleset = canonicalRuleset([rule()]);
  const repository = createMemoryRepository({
    "architecture/rulesets/architecture-core.v1.json": JSON.stringify(ruleset),
    "scripts/apid.mjs": "export {};",
    "packages/example/package.json": JSON.stringify({
      name: "@apidevelopers/example",
    }),
  });

  const runtime = await loadRuleEngineRuntime(input(), {
    ...repository,
    changedFiles: [
      "packages/example/package.json",
      "scripts/apid.mjs",
    ],
  });

  assert.equal(runtime.loadState.ruleset, "VALIDATED");
  assert.equal(runtime.loadState.exceptions, "MISSING_OPTIONAL");
  assert.deepEqual(runtime.resolvedFiles, [
    "packages/example/package.json",
    "scripts/apid.mjs",
  ]);
});

test("required-path reports exact and companion files deterministically", async () => {
  const repository = createMemoryRepository({
    "packages/kernel-example/package.json": "{}",
    "packages/kernel-example/README.md": "",
  });
  const adapters = createBuiltinAdapters(repository);

  const findings = await adapters["required-path"]({
    rule: rule({
      parameters: {
        paths: ["scripts/apid.mjs"],
        forEach: "packages/kernel-*/package.json",
        relativePaths: ["src/index.mjs", "test/index.test.mjs"],
      },
    }),
    targets: await repository.listFiles(),
  });

  assert.deepEqual(findings.map((finding) => finding.path), [
    "scripts/apid.mjs",
    "packages/kernel-example/src/index.mjs",
    "packages/kernel-example/test/index.test.mjs",
  ]);
});

test("required-field validates JSON pointer and package namespace", async () => {
  const repository = createMemoryRepository({
    "packages/good/package.json": JSON.stringify({ name: "@apidevelopers/good" }),
    "packages/bad/package.json": JSON.stringify({ name: "@legacy/bad" }),
  });
  const adapters = createBuiltinAdapters(repository);

  const findings = await adapters["required-field"]({
    rule: rule({
      type: "required-field",
      appliesTo: {
        include: ["packages/*/package.json"],
        exclude: [],
      },
      parameters: {
        pointer: "/name",
        pattern: "^@apidevelopers/",
      },
    }),
    targets: await repository.listFiles(),
  });

  assert.deepEqual(findings.map((finding) => finding.path), [
    "packages/bad/package.json",
  ]);
});

test("pattern adapters preserve locations without exposing matched text", async () => {
  const repository = createMemoryRepository({
    "scripts/example.mjs": "first line\nconst password = 'blocked';\n",
  });
  const adapters = createBuiltinAdapters(repository);

  const forbidden = await adapters["forbidden-pattern"]({
    rule: rule({
      type: "forbidden-pattern",
      appliesTo: {
        include: ["scripts/**"],
        exclude: [],
      },
      parameters: {
        patterns: ["password\\s*="],
      },
    }),
    targets: await repository.listFiles(),
  });

  assert.deepEqual(forbidden[0].location, { line: 2, column: 7 });
  assert.deepEqual(forbidden[0].observed, {
    present: true,
    patternIndex: 0,
  });
  assert.equal(JSON.stringify(forbidden).includes("blocked"), false);

  const required = await adapters["required-pattern"]({
    rule: rule({
      type: "required-pattern",
      appliesTo: {
        include: ["scripts/**"],
        exclude: [],
      },
      parameters: {
        patterns: ["export\\s"],
      },
    }),
    targets: await repository.listFiles(),
  });

  assert.equal(required.length, 1);
});

test("allowed-value enforces canonical manifest values", async () => {
  const repository = createMemoryRepository({
    "packages/example/package.json": JSON.stringify({
      type: "commonjs",
    }),
  });
  const adapters = createBuiltinAdapters(repository);

  const findings = await adapters["allowed-value"]({
    rule: rule({
      type: "allowed-value",
      appliesTo: {
        include: ["packages/*/package.json"],
        exclude: [],
      },
      parameters: {
        pointer: "/type",
        values: ["module"],
      },
    }),
    targets: await repository.listFiles(),
  });

  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].expected, {
    pointer: "/type",
    allowedValues: ["module"],
  });
});
