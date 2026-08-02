import test from "node:test";
import assert from "node:assert/strict";

import { createPreviewPromotionPlan } from "../src/preview-promotion.mjs";
import {
  createPreviewPromotionPacket,
  REQUIRED_ARTIFACT_FILES,
} from "../src/preview-promotion-packet.mjs";

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

const sourceSha = "8626c794df4b6db38d060c3ff68cd228b66b552a";

function createPlan() {
  return createPreviewPromotionPlan({
    manifest,
    sourceRepository: "apidevelopers-digital/apidevelopers-platform",
    sourceSha,
    artifactName: `site-factory-reference-${sourceSha}`,
    generatedAt: "2026-08-02T06:29:02.000Z",
  });
}

test("creates a deterministic immutable dry-run promotion packet", () => {
  const input = {
    plan: createPlan(),
    sourceRepository: "apidevelopers-digital/apidevelopers-platform",
    sourceSha,
    sourceRunId: "30735969491",
    artifactName: `site-factory-reference-${sourceSha}`,
    artifactFiles: [...REQUIRED_ARTIFACT_FILES],
    generatedAt: "2026-08-02T06:30:00.000Z",
  };

  const first = createPreviewPromotionPacket(input);
  const second = createPreviewPromotionPacket(input);

  assert.equal(first.mode, "dry-run");
  assert.equal(first.readyForApply, false);
  assert.equal(first.writesEnabled, false);
  assert.equal(first.deployEnabled, false);
  assert.equal(first.dnsEnabled, false);
  assert.equal(first.source.sha, sourceSha);
  assert.equal(first.source.workflowRunId, "30735969491");
  assert.equal(first.target.domain, "preview-apidevelopers.apidevelopers.digital");
  assert.equal(first.fingerprint, second.fingerprint);
});

test("rejects an artifact name that is not pinned to the source SHA", () => {
  assert.throws(
    () =>
      createPreviewPromotionPacket({
        plan: createPlan(),
        sourceRepository: "apidevelopers-digital/apidevelopers-platform",
        sourceSha,
        sourceRunId: "30735969491",
        artifactName: "site-factory-reference-wrong",
        artifactFiles: [...REQUIRED_ARTIFACT_FILES],
      }),
    /artifact_name_sha_mismatch/,
  );
});

test("rejects an incomplete artifact", () => {
  assert.throws(
    () =>
      createPreviewPromotionPacket({
        plan: createPlan(),
        sourceRepository: "apidevelopers-digital/apidevelopers-platform",
        sourceSha,
        sourceRunId: "30735969491",
        artifactName: `site-factory-reference-${sourceSha}`,
        artifactFiles: ["dist/index.html", "publishing-manifest.json"],
      }),
    /missing_artifact_file:reference-build-evidence\.json/,
  );
});
