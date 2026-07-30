import test from "node:test";
import assert from "node:assert/strict";

import {
  assertPublishingManifest,
  validatePublishingManifest,
} from "../src/publishing-manifest.mjs";

const validManifest = {
  schemaVersion: "1.0",
  app: "institutional-site",
  domain: "apidevelopers.digital",
  runtime: "react-vite",
  branch: "main",
  hosting: "hostinger",
  build: "npm run build",
  output: "dist",
  healthcheck: "/",
  approvalPolicy: "explicit-igor-approval",
  preview: {
    required: true,
    domainPattern: "preview-apidevelopers.apidevelopers.digital",
  },
  release: {
    byCommit: true,
    rollbackByCommit: true,
  },
  requiredChecks: ["build", "test", "healthcheck"],
  requiredSecrets: [],
};

test("accepts a canonical GitHub-first publishing manifest", () => {
  const result = validatePublishingManifest(validManifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalized.domain, "apidevelopers.digital");
});

test("rejects a manifest without explicit approval", () => {
  const result = validatePublishingManifest({
    ...validManifest,
    approvalPolicy: "automatic",
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("unsupported_approval_policy"));
});

test("rejects frontend runtime without build output", () => {
  const { output, ...withoutOutput } = validManifest;
  const result = validatePublishingManifest(withoutOutput);

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("output_required_for_frontend"));
});

test("requires preview and rollback by commit", () => {
  const result = validatePublishingManifest({
    ...validManifest,
    preview: { required: false, domainPattern: "" },
    release: { byCommit: true, rollbackByCommit: false },
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("preview_must_be_required"));
  assert.ok(result.errors.includes("preview_domain_pattern_required"));
  assert.ok(result.errors.includes("rollback_by_commit_required"));
});

test("assertion returns normalized manifest or throws", () => {
  assert.equal(assertPublishingManifest(validManifest).app, "institutional-site");

  assert.throws(
    () => assertPublishingManifest({}),
    (error) => error.code === "INVALID_PUBLISHING_MANIFEST",
  );
});
