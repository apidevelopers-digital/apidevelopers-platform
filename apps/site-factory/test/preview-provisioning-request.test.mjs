import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewProvisioningRequest } from "../src/preview-provisioning-request.mjs";

const promotionPlan = {
  mode: "dry-run",
  writesEnabled: false,
  deployEnabled: false,
  dnsEnabled: false,
  runtime: "react-vite",
  source: {
    repository: "apidevelopers-digital/apidevelopers-platform",
    sha: "ff17ac8e0bd524075c0fbb3fd737f87dca1edde2",
    artifactName: "site-factory-reference-ff17ac8e",
  },
  target: {
    domain: "preview-apidevelopers.apidevelopers.digital",
    healthcheck: "/",
  },
  fingerprint: "promotion-fingerprint",
};

const readinessReport = {
  mode: "external-readiness-dry-run",
  writesEnabled: false,
  deployEnabled: false,
  dnsEnabled: false,
  source: { ...promotionPlan.source },
  target: { ...promotionPlan.target },
  hosting: { websiteExists: false, websiteEnabled: false },
  blockers: ["preview_web_app_not_found"],
  requiredActions: [{
    action: "create_preview_web_app",
    sensitive: true,
    approvalRequired: true,
    executable: false,
  }],
  fingerprint: "readiness-fingerprint",
};

const input = {
  promotionPlan,
  readinessReport,
  hostingContext: {
    provider: "hostinger",
    orderId: 1009450581,
    username: "u242521810",
    plan: "hostinger_business_v3",
    inventoryCapturedAt: "2026-07-30T21:29:00.000Z",
    websitesInspected: 4,
    previewDnsRecordExists: false,
  },
  buildCommand: "npm run build",
  outputDirectory: "dist",
  applicationName: "apidevelopers-institutional-preview",
  requestedAt: "2026-07-30T21:30:00.000Z",
};

test("creates an immutable non-executable request", () => {
  const request = createPreviewProvisioningRequest(input);
  assert.equal(request.mode, "supervised-request");
  assert.equal(request.executable, false);
  assert.equal(request.requestedAction.executable, false);
  assert.equal(request.requestedAction.connectsRepository, false);
  assert.equal(request.requestedAction.configuresDns, false);
  assert.equal(request.requestedAction.deploysArtifact, false);
  assert.equal(request.invariants.preservePrimaryDomain, true);
  assert.equal(request.invariants.preserveCurrentWordPress, true);
  assert.match(request.approvalToken, /^IGOR_APROVA_CRIACAO_WEBAPP_PREVIEW_[A-F0-9]{12}$/);
  assert.ok(Object.isFrozen(request.requestedAction));
});

test("is deterministic", () => {
  const first = createPreviewProvisioningRequest(input);
  const second = createPreviewProvisioningRequest(input);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.approvalToken, second.approvalToken);
});

test("rejects existing Web App", () => {
  assert.throws(() => createPreviewProvisioningRequest({
    ...input,
    readinessReport: {
      ...readinessReport,
      hosting: { websiteExists: true, websiteEnabled: true },
      blockers: [],
    },
  }), /preview_web_app_already_exists/);
});

test("rejects SHA mismatch", () => {
  assert.throws(() => createPreviewProvisioningRequest({
    ...input,
    readinessReport: {
      ...readinessReport,
      source: { ...readinessReport.source, sha: "different-sha" },
    },
  }), /source_sha_mismatch/);
});

test("rejects enabled writes", () => {
  for (const field of ["writesEnabled", "deployEnabled", "dnsEnabled"]) {
    assert.throws(() => createPreviewProvisioningRequest({
      ...input,
      promotionPlan: { ...promotionPlan, [field]: true },
    }), /must_be_false/);
  }
});

test("rejects existing preview DNS", () => {
  assert.throws(() => createPreviewProvisioningRequest({
    ...input,
    hostingContext: { ...input.hostingContext, previewDnsRecordExists: true },
  }), /preview_dns_record_already_exists/);
});
