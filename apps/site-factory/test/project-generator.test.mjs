import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  generateReactViteProject,
  planReactViteProject,
} from "../src/project-generator.mjs";

const baseOptions = {
  app: "institutional-preview",
  domain: "preview.apidevelopers.digital",
  title: "API Developers.digital",
  outputRoot: "/tmp/site-factory-projects",
};

test("plans a reusable React/Vite project without writes", () => {
  const plan = planReactViteProject(baseOptions);

  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.writesEnabled, false);
  assert.equal(plan.readyForApply, true);
  assert.ok(plan.files.includes("publishing-manifest.json"));
  assert.ok(plan.files.includes("src/App.jsx"));
  assert.equal(plan.manifest.approvalPolicy, "explicit-igor-approval");
  assert.equal(plan.manifest.preview.required, true);
  assert.equal(plan.manifest.release.rollbackByCommit, true);
});

test("rejects unsafe project names and domains", () => {
  assert.throws(
    () => planReactViteProject({ ...baseOptions, app: "../escape" }),
    /app_must_be_kebab_case/,
  );

  assert.throws(
    () => planReactViteProject({ ...baseOptions, domain: "localhost" }),
    /domain_is_invalid/,
  );
});

test("applies only inside a new isolated directory", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "site-factory-"));
  const result = await generateReactViteProject({
    ...baseOptions,
    outputRoot,
    apply: true,
  });

  assert.equal(result.mode, "apply");
  assert.equal(result.writesEnabled, true);

  const manifest = JSON.parse(
    await readFile(
      path.join(result.targetDirectory, "publishing-manifest.json"),
      "utf8",
    ),
  );

  assert.equal(manifest.runtime, "react-vite");

  await assert.rejects(
    () =>
      generateReactViteProject({
        ...baseOptions,
        outputRoot,
        apply: true,
      }),
    /target_directory_already_exists/,
  );
});
