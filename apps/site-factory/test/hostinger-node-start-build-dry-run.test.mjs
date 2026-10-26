import test from "node:test";
import assert from "node:assert/strict";
import { serializeHostingerNodeStartBuildDryRun as run } from "../src/hostinger-node-start-build-dry-run.mjs";
const valid = () => ({ node_version: 22, app_type: "vite", root_directory: "webapp",
  output_directory: "dist", build_script: "build", source_type: "archive",
  source_options: { archive_path: "uploads/site.zip" }, entry_file: null, package_manager: "npm" });

test("complete immutable dry-run, never executable", () => {
  const input = valid(), output = run(input);
  assert.deepEqual(JSON.parse(JSON.stringify(output.body)), input);
  assert.equal(output.mode, "dry-run");
  for (const key of ["writesEnabled", "remoteBuildStarted", "productionExecutionAllowed"])
    assert.equal(output[key], false);
  for (const obj of [output, output.body, output.body.source_options])
    assert.equal(Object.isFrozen(obj), true);
});

test("required keys including nullable keys are explicit", () => {
  const nullable = { ...valid(), app_type: null, root_directory: null,
    output_directory: null, build_script: null };
  assert.equal(run(nullable).body.app_type, null);
  for (const key of ["node_version", "app_type", "root_directory", "output_directory",
    "build_script", "source_type", "source_options"]) {
    const input = valid(); delete input[key];
    assert.throws(() => run(input), new RegExp(`missing_${key}`));
  }
});

test("invalid version, framework, source and package manager fail closed", () => {
  for (const [key, value] of [["node_version", 21], ["node_version", "22"],
    ["app_type", "unknown"], ["source_type", "git"], ["package_manager", "bun"]]) {
    assert.throws(() => run({ ...valid(), [key]: value }), /invalid_|unsupported_/);
  }
});

test("unsafe archive paths and directory traversal fail closed", () => {
  for (const archive_path of ["../site.zip", "/site.zip", "https://x/site.zip",
    "site%2e.zip", "uploads//site.zip", "uploads\\site.zip", "site.zip?a=1",
    "site.txt", "a/./site.zip", "a/../site.zip"]) {
    assert.throws(() => run({ ...valid(), source_options: { archive_path } }), /invalid_archive_path/);
  }
  for (const key of ["root_directory", "output_directory", "entry_file"])
    assert.throws(() > run({ ...valid(), [key]: "../secret" }), new RegExp(`invalid_${key}`));
});

test("unknown fields, empty values, and incomplete archive source are blocked", () > {
  assert.throws(() => run({ ...valid(), source_options: {} }), /missing_archive_path/);
  assert.throws(() > run({ ...valid(), source_options: { archive_path: "site.zip", token: "x" } }), /unknown_source_options_field/);
  assert.throws(() => run({ ...valid(), token: "x" }), /unknown_start_build_field/);
  assert.throws(() => run({ ...valid(), build_script: "" }), /invalid_build_script/);
  assert.throws(() => run({ ...valid(), source_options: null }), /invalid_source_options/);
  const input = valid(); delete input.entry_file; delete input.package_manager;
  assert.equal(Object.hasOwn(run(input).body, "entry_file"), false);
});
