import test from "node:test";
import assert from "node:assert/strict";
import { serializeHostingerNodeStartBuildDryRun as run } from "../src/hostinger-node-start-build-dry-run.mjs";
const good = () => ({ node_version: 22, app_type: "vite", root_directory: "web",
  output_directory: "dist", build_script: "build", source_type: "archive",
  source_options: { archive_path: "uploads/site.zip" }, entry_file: null, package_manager: "npm" });
test("complete immutable dry-run request", () => {
  const body = good(), report = run(body);
  assert.deepEqual(JSON.parse(JSON.stringify(report.body)), body);
  assert.equal(report.mode, "dry-run");
  for (const k of ["writesEnabled", "remoteBuildStarted", "productionExecutionAllowed"]) assert.equal(report[k], false);
  for (const o of [report, report.body, report.body.source_options]) assert.equal(Object.isFrozen(o), true);
});
test("required nullable fields must be provided explicitly", () => {
  assert.equal(run({ ...good(), app_type: null, build_script: null }).body.app_type, null);
  for (const k of ["node_version","app_type","root_directory","output_directory","build_script","source_type","source_options"]) {
    const obj = good(); delete obj[k];
    assert.throws(() => run(obj), new RegExp("missing_" + k));
  }
});
test("invalid enums and arbitrary fields fail closed", () => {
  for (const [k,v] of [["node_version",21],["app_type","unknown"],["package_manager","bun"],["source_type","git"]])
    assert.throws(() => run({ ...good(), [k]: v }), /invalid_|unsupported_/);
  assert.throws(() => run({ ...good(), auth: "token" }), /unknown_start_build_field/);
});
test("unsafe paths, missing archive, and invalid strings fail closed", () => {
  for (const p of ["../x.zip","/x.zip","https://x/x.zip","a//x.zip","a/./x.zip","a/../x.zip","x%2e.zip","x.txt","x.zip?x=1"])
    assert.throws(() => run({ ...good(), source_options: { archive_path: p } }), /invalid_archive_path/);
  for (const k of ["root_directory","output_directory","entry_file"])
    assert.throws(() => run({ ...good(), [k]: "../private" }), new RegExp("invalid_" + k));
  assert.throws(() => run({ ...good(), source_options: {} }), /missing_archive_path/);
  assert.throws(() => run({ ...good(), source_options: null }), /invalid_source_options/);
  assert.throws(() => run({ ...good(), build_script: "" }), /invalid_build_script/);
  const obj = good(); delete obj.entry_file; delete obj.package_manager;
  assert.equal(Object.hasOwn(run(obj).body, "entry_file"), false);
});
