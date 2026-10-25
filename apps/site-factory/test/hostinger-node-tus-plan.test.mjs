import test from "node:test";
import assert from "node:assert/strict";
import { planHostingerNodeArchiveUpload, assertHostingerNodeWriteAuthorization } from "../src/hostinger-node-tus-plan.mjs";

const target = { username: "example-user", domain: "example.test" };

test("Hostinger TUS planner is read-only and targets current endpoints", () => {
  const plan = planHostingerNodeArchiveUpload({ ...target, archivePath: "site.zip" });
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.writesEnabled, false);
  assert.equal(plan.buildStartAllowed, false);
  assert.equal(plan.tusUploadRequired, true);
  assert.deepEqual(plan.uploadUrlRequest, {
    method: "POST",
    path: "/api/hosting/v1/files/upload-urls",
    body: target,
  });
  assert.equal(plan.buildRequest.source_type, "archive");
  assert.deepEqual(plan.buildRequest.source_options, { archive_path: "site.zip" });
  assert.match(plan.buildRequest.path, /\/nodejs\/builds$/);
});

test("Hostinger TUS planner rejects unsafe archive paths and missing input", () => {
  for (const archivePath of ["../bad.zip", "/root.zip", "a\\b.zip", "a?b.zip", "a#b.zip"]) {
    assert.throws(() => planHostingerNodeArchiveUpload({ ...target, archivePath }), /invalid_archive_path/);
  }
  assert.throws(() => planHostingerNodeArchiveUpload({ ...target, archivePath: "" }), /missing_archive_path/);
  assert.throws(() => planHostingerNodeArchiveUpload({ ...target, domain: "", archivePath: "site.zip" }), /missing_domain/);
});

test("Hostinger Node write authorization fails closed", () => {
  assert.throws(() => assertHostingerNodeWriteAuthorization(), /hostinger_node_write_blocked/);
});
