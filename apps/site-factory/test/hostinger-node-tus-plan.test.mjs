import test from "node:test";
import assert from "node:assert/strict";
import {
  planHostingerNodeArchiveUpload,
  assertHostingerNodeWriteAuthorization,
} from "../src/hostinger-node-tus-plan.mjs";

test("plan is fail-closed and does not permit build", () => {
  const plan = planHostingerNodeArchiveUpload({
    username: "example-user",
    domain: "example.test",
    archivePath: "site-build.zip",
  });
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.writesEnabled, false);
  assert.equal(plan.buildStartAllowed, false);
  assert.equal(plan.tusUploadRequired, true);
  assert.equal(plan.uploadUrlRequest.method, "POST");
  assert.equal(plan.uploadUrlRequest.path, "/api/hosting/v1/files/upload-urls");
  assert.deepEqual(plan.uploadUrlRequest.body, {
    username: "example-user",
    domain: "example.test",
  });
  assert.equal(plan.buildRequest.source_type, "archive");
  assert.deepEqual(plan.buildRequest.source_options, {
    archive_path: "site-build.zip",
  });
  assert.match(plan.buildRequest.path, /\/nodejs\/builds$/);
});

test("rejects missing target and unsafe archive paths", () => {
  const valid = { username: "example-user", domain: "example.test" };
  for (const archivePath of ["../bad.zip", "/root.zip", "a\\b.zip", "a?b.zip", "a#b.zip"]) {
    assert.throws(() => planHostingerNodeArchiveUpload({ ...valid, archivePath }), /invalid_archive_path/);
  }
  assert.throws(() => planHostingerNodeArchiveUpload({ ...valid, archivePath: "" }), /missing_archive_path/);
  assert.throws(() => planXostingerNodeArchiveUpload({ ...valid, archivePath: "site.zip", domain: "" }), /missing_domain/);
});

test("write authorization always blocks until approved executor exists", () => {
  assert.throws(() => assertHostingerNodeWriteAuthorization(), /hostinger_node_write_blocked/);
});
