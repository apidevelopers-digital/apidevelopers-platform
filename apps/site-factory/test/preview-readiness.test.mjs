import test from "node:test";
import assert from "node:assert/strict";

import { createPreviewReadinessReport } from "../src/preview-readiness.mjs";

const promotionPlan = {
  mode: "dry-run",
  writesEnabled: false,
  deployEnabled: false,
  dnsEnabled: false,
  hosting: "hostinger",
  source: {
    repository: "apidevelopers-digital/apidevelopers-platform",
    sha: "abc123",
    artifactName: "site-factory-reference-abc123",
  },
  target: {
    environment: "preview",
    domain: "preview-apidevelopers.apidevelopers.digital",
    healthcheck: "/",
  },
};

test("reports missing preview web app without enabling writes", () => {
  const report = createPreviewReadinessReport({
    promotionPlan,
    hostingSnapshot: { data: [] },
    checkedAt: "2026-07-30T20:00:00.000Z",
  });

  assert.equal(report.mode, "external-readiness-dry-run");
  assert.equal(report.readyForApply, false);
  assert.equal(report.writesEnabled, false);
  assert.equal(report.deployEnabled, false);
  assert.equal(report.dnsEnabled, false);
  assert.equal(report.hosting.websiteExists, false);
  assert.ok(report.blockers.includes("preview_web_app_not_found"));
  assert.ok(
    report.requiredActions.some(
      (item) =>
        item.action === "create_preview_web_app" &&
        item.approvalRequired === true &&
        item.executable === false,
    ),
  );
});

test("recognizes an existing enabled preview web app", () => {
  const report = createPreviewReadinessReport({
    promotionPlan,
    hostingSnapshot: {
      data: [
        {
          domain: "preview-apidevelopers.apidevelopers.digital",
          is_enabled: true,
          status: "active",
        },
      ],
    },
    checkedAt: "2026-07-30T20:00:00.000Z",
  });

  assert.equal(report.hosting.websiteExists, true);
  assert.equal(report.hosting.websiteEnabled, true);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.readyForSupervisedPreview, true);
  assert.equal(report.readyForApply, false);
});

test("rejects a promotion plan that permits external writes", () => {
  assert.throws(
    () =>
      createPreviewReadinessReport({
        promotionPlan: { ...promotionPlan, deployEnabled: true },
        hostingSnapshot: [],
      }),
    /promotion_plan_must_block_external_writes/,
  );
});

test("produces a deterministic fingerprint", () => {
  const input = {
    promotionPlan,
    hostingSnapshot: [],
    checkedAt: "2026-07-30T20:00:00.000Z",
  };

  assert.equal(
    createPreviewReadinessReport(input).fingerprint,
    createPreviewReadinessReport(input).fingerprint,
  );
});
