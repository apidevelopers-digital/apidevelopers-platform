import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyValidationReport } from "../src/index.mjs";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function execute(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

function requireSuccess(result, label) {
  assert.equal(
    result.status,
    0,
    `${label} failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

async function copyFixtureFile(root, relativePath) {
  const source = path.join(REPOSITORY_ROOT, relativePath);
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}

async function createFixture({ includeKernelReadme = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "apid-architecture-fixture-"));

  for (const relativePath of [
    "scripts/apid.mjs",
    "scripts/architecture-validate.mjs",
    "architecture/rulesets/architecture-core.v1.json",
    "architecture/exceptions/snapshot.v1.json",
    "packages/architecture-rule-engine/package.json",
    "packages/architecture-rule-engine/src/index.mjs",
    "packages/architecture-rule-engine/src/repository.mjs",
    "packages/architecture-rule-engine/src/filesystem-repository.mjs",
    "packages/architecture-rule-engine/src/loaders.mjs",
    "packages/architecture-rule-engine/src/adapters.mjs",
    "packages/architecture-rule-engine/src/export-contract.mjs",
    "packages/architecture-rule-engine/src/validation-service.mjs",
  ]) {
    await copyFixtureFile(root, relativePath);
  }

  const kernelRoot = path.join(root, "packages/kernel-example");
  await mkdir(path.join(kernelRoot, "src"), { recursive: true });
  await mkdir(path.join(kernelRoot, "test"), { recursive: true });

  await writeFile(
    path.join(kernelRoot, "package.json"),
    `${JSON.stringify({
      name: "@apidevelopers/kernel-example",
      version: "0.1.0",
      private: true,
      type: "module",
      exports: {
        ".": "./src/index.mjs",
      },
      engines: { node: ">=22" },
    }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(kernelRoot, "src/index.mjs"),
    "export const ok = true;\n",
    "utf8",
  );
  await writeFile(
    path.join(kernelRoot, "test/index.test.mjs"),
    [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { ok } from "../src/index.mjs";',
      'test("fixture kernel", () => assert.equal(ok, true));',
      "",
    ].join("\n"),
    "utf8",
  );

  if (includeKernelReadme) {
    await writeFile(
      path.join(kernelRoot, "README.md"),
      "# Kernel Example\n",
      "utf8",
    );
  }

  requireSuccess(execute("git", ["init", "-b", "fixture"], root), "git init");
  requireSuccess(
    execute("git", ["config", "user.name", "Architecture Fixture"], root),
    "git config name",
  );
  requireSuccess(
    execute("git", ["config", "user.email", "fixture@example.invalid"], root),
    "git config email",
  );
  requireSuccess(execute("git", ["add", "."], root), "git add");
  requireSuccess(
    execute("git", ["commit", "-m", "fixture"], root),
    "git commit",
  );

  const revision = execute("git", ["rev-parse", "HEAD"], root);
  requireSuccess(revision, "git rev-parse");

  return {
    root,
    branch: "fixture",
    commitSha: revision.stdout.trim(),
  };
}

function runValidation(fixture, extraArguments = []) {
  return execute(
    process.execPath,
    [
      "scripts/apid.mjs",
      "architecture",
      "validate",
      "--branch",
      fixture.branch,
      "--commit-sha",
      fixture.commitSha,
      "--scope",
      "repository",
      ...extraArguments,
    ],
    fixture.root,
  );
}

test("apid architecture validate writes a verified compliant report for a complete fixture", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  const output = "artifacts/architecture/fixture-report.json";
  const result = runValidation(fixture, ["--output", output]);

  requireSuccess(result, "architecture validation");

  const summary = JSON.parse(result.stdout);
  const report = JSON.parse(
    await readFile(path.join(fixture.root, output), "utf8"),
  );

  assert.equal(summary.result, "COMPLIANT");
  assert.equal(summary.findingCount, 0);
  assert.equal(summary.blockingFindingCount, 0);
  assert.equal(summary.output, output);
  assert.equal(report.summary.result, "COMPLIANT");
  assert.equal(report.summary.findingCount, 0);
  assert.equal(report.revision.commitSha, fixture.commitSha);
  assert.equal(report.revision.branch, fixture.branch);
  assert.equal(report.ruleset.rulesetId, "architecture-core");
  assert.equal(report.ruleset.version, "1.1.0");
  assert.equal(report.scope.mode, "repository");
  assert.ok(report.scope.resolvedFileCount > 0);
  assert.equal(verifyValidationReport(report), true);
});

test("apid architecture validate returns a verified blocking finding for an incomplete kernel fixture", async (context) => {
  const fixture = await createFixture({ includeKernelReadme: false });
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  const result = runValidation(fixture, ["--no-write", "--stdout"]);

  assert.equal(
    result.status,
    1,
    `validation should fail.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  assert.equal(result.stderr, "");

  const report = JSON.parse(result.stdout);

  assert.equal(report.summary.result, "NON_COMPLIANT");
  assert.equal(report.summary.findingCount, 1);
  assert.equal(report.summary.blockingFindingCount, 1);
  assert.equal(report.findings[0].ruleId, "ARC-KRN-001");
  assert.equal(
    report.findings[0].path,
    "packages/kernel-example/README.md",
  );
  assert.equal(report.findings[0].severity, "ERROR");
  assert.equal(verifyValidationReport(report), true);
});
