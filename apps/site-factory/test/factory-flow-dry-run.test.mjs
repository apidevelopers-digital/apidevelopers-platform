import test from "node:test";
import assert from "node:assert/strict";
import { planReactViteProject } from "../src/project-generator.mjs";
import { createPreviewPromotionPlan } from "../src/preview-promotion.mjs";
import { createPreviewPromotionPacket, REQUIRED_ARTIFACT_FILES } from "../src/preview-promotion-packet.mjs";

test("Site Factory: project -> manifest -> preview packet is fail-closed", () => {
  const project = planReactViteProject({
    app: "factory-smoke", domain: "example.com", title: "Site Factory",
    outputRoot: "/tmp/site-factory-smoke",
  });
  assert.equal(project.mode, "dry-run");
  assert.equal(project.writesEnabled, false);
  assert.deepEqual(JSON.parse(project.renderedFiles["publishing-manifest.json"]), project.manifest);

  const sha = "0123456789abcdef0123456789abcdef01234567";
  const common = {
    sourceRepository: "apidevelopers-digital/apidevelopers-platform",
    sourceSha: sha, artifactName: `site-factory-reference-${sha}`,
  };
  const plan = createPreviewPromotionPlan({
    manifest: project.manifest, ...common, generatedAt: "2026-10-28T00:00:00Z",
  });
  assert.equal(plan.target.domain, "preview-factory-smoke.apidevelopers.digital");
  assert.equal(plan.writesEnabled, false);
  assert.equal(plan.deployEnabled, false);
  assert.equal(plan.approvalRequired, true);

  const packetInput = {
    plan, ...common, sourceRunId: "123456789",
    artifactFiles: [...REQUIRED_ARTIFACT_FILES],
    generatedAt: "2026-10-28T00:01:00Z",
  };
  const packet = createPreviewPromotionPacket(packetInput);
  assert.equal(packet.writesEnabled, false);
  assert.equal(packet.deployEnabled, false);
  assert.equal(packet.dnsEnabled, false);
  assert.equal(packet.approvalRequired, true);
  assert.equal(packet.promotionPlanFingerprint, plan.fingerprint);
  assert.equal(packet.target.domain, plan.target.domain);

  assert.throws(
    () => createPreviewPromotionPacket({
      ...packetInput, artifactFiles: ["dist/index.html", "publishing-manifest.json"],
    }),
    /missing_artifact_file:reference-build-evidence\.json/,
  );
});
