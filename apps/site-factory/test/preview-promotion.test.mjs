import test from "node:test";
import assert from "node:assert/strict";

import { createPreviewPromotionPlan } from "../src/preview-promotion.mjs";

const manifest = {
  schemaVersion: "1.0",
  app: "apidevelopers-institutional-site",
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

test("creates a deterministic read-only preview promotion plan", () => {
  const input = {
    manifest,
    sourceRepository: "apidevelopers-digital/apidevelopers-platform",
    sourceSha: "abc123",
    artifactName: "site-factory-reference-abc123",
    generatedAt: "2026-07-30T20:00:00.000Z",
  };

  const first = createPreviewPromotionPlan(input);
  const second = createPreviewPromotionPlan(input);

  assert.equal(first.mode, "dry-run");
  assert.equal(first.readyForApply, false);
  assert.equal(first.writesEnabled, false);
  assert.equal(first.deployEnabled, false);
  assert.equal(first.dnsEnabled, false);
  assert.equal(first.approvalRequired, true);
  assert.equal(first.target.environment, "preview");
  assert.equal(first.fingerprint, second.fingerprint);
});

test("rejects incomplete source evidence", () => {
  assert.throws(
    () =>
      createPreviewPromotionPlan({
        manifest,
        sourceRepository: "",
        sourceSha: "abc123",
        artifactName: "artifact",
      }),
    /missing_or_invalid:sourceRepository/,
  );
});
