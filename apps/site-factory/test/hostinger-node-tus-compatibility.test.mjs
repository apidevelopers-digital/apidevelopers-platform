import test from "node:test";
import assert from "node:assert/strict";
import { inspectHostingerNodeTusMigration, assertHostingerNodeTusMigrationExecutionAllowed } from "../src/hostinger-node-tus-compatibility.mjs";

test("TUS compatibility view preserves verified legacy execution boundary", () => {
  const view = inspectHostingerNodeTusMigration({ username: "example-user", domain: "example.test", archivePath: "site.zip" });
  assert.equal(view.mode, "dry-run");
  assert.equal(view.writesEnabled, false);
  assert.equal(view.legacyExecutionPath, "operator-central-multipart");
  assert.equal(view.legacyDirectRunnerBlocked, true);
  assert.equal(view.tusUploadRequired, true);
  assert.equal(view.migrationReadyForProduction, false);
  assert.equal(view.tusUploadUrlRequest.method, "POST");
  assert.equal(view.tusBuildRequest.source_type, "archive");
});
test("TUS compatibility view rejects unsafe input and execution", () => {
  assert.throws(() => inspectHostingerNodeTusMigration({ username: "user", domain: "example.test", archivePath: "../bad.zip" }), /invalid_archive_path/);
  assert.throws(assertHostingerNodeTusMigrationExecutionAllowed, /migration_execution_blocked/);
});
