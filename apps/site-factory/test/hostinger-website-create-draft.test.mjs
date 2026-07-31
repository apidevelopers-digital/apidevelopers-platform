import test from "node:test";
import assert from "node:assert/strict";

import { createHostingerWebsiteCreateDraft } from "../src/hostinger-website-create-draft.mjs";

const generatedAt = "2026-07-31T01:00:00.000Z";
const sourceSha = "6ea6b837a2e80a15682136344ff3a78ebd602a9c";
const domain = "preview-apidevelopers.apidevelopers.digital";

const preflightReport = {
  schemaVersion: "1.1",
  kind: "hostinger-business-hosting-preview-preflight",
  mode: "read-only",
  executable: false,
  writesEnabled: false,
  provisioningEnabled: false,
  dnsEnabled: false,
  deployEnabled: false,
  checkedAt: "2026-07-31T00:58:00.000Z",
  provider: "hostinger",
  product: "business-web-hosting",
  orderReference: "order-****0581",
  datacenters: [
    {
      code: "br-1",
      title: "Brazil",
      coordinates: { latitude: -23.55, longitude: -46.63 },
    },
  ],
  blockers: [],
  readyForProvisioningApproval: true,
  fingerprint: "preflight-fingerprint",
};

const input = {
  domain,
  expectedDomain: domain,
  orderId: "1009450581",
  datacenterCode: "br-1",
  preflightReport,
  sourceRepository:
    "apidevelopers-digital/apidevelopers-platform",
  sourceSha,
  generatedAt,
};

test("creates an immutable non-executable website creation draft", () => {
  const draft = createHostingerWebsiteCreateDraft(input);

  assert.equal(draft.mode, "approval-draft");
  assert.equal(draft.executable, false);
  assert.equal(draft.approvalRequired, true);
  assert.equal(draft.request.method, "POST");
  assert.equal(draft.request.endpoint, "/api/hosting/v1/websites");
  assert.equal(draft.request.execute, false);
  assert.deepEqual(draft.request.payload, {
    domain,
    order_id: "1009450581",
    datacenter_code: "br-1",
  });
  assert.equal(draft.invariants.preserveCurrentWordPress, true);
  assert.equal(draft.invariants.connectRepository, false);
  assert.equal(draft.invariants.configureDns, false);
  assert.equal(draft.invariants.startNodeBuild, false);
  assert.equal(draft.invariants.deployArtifact, false);
  assert.match(
    draft.approvalToken,
    /^IGOR_APROVA_CRIACAO_WEBSITE_PREVIEW_[A-F0-9]{12}$/,
  );
  assert.match(draft.fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(draft));
  assert.ok(Object.isFrozen(draft.request.payload));
});

test("is deterministic for identical evidence", () => {
  const first = createHostingerWebsiteCreateDraft(input);
  const second = createHostingerWebsiteCreateDraft(input);

  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.approvalToken, second.approvalToken);
});

test("rejects a datacenter not present in the live preflight", () => {
  assert.throws(
    () =>
      createHostingerWebsiteCreateDraft({
        ...input,
        datacenterCode: "unknown-1",
      }),
    /datacenter_code_not_present_in_preflight/,
  );
});

test("rejects a stale preflight report", () => {
  assert.throws(
    () =>
      createHostingerWebsiteCreateDraft({
        ...input,
        preflightReport: {
          ...preflightReport,
          checkedAt: "2026-07-30T00:00:00.000Z",
        },
      }),
    /preflight_report_stale_or_from_future/,
  );
});

test("rejects executable or write-enabled preflight evidence", () => {
  for (const [field, value] of [
    ["executable", true],
    ["writesEnabled", true],
    ["provisioningEnabled", true],
    ["dnsEnabled", true],
    ["deployEnabled", true],
  ]) {
    assert.throws(
      () =>
        createHostingerWebsiteCreateDraft({
          ...input,
          preflightReport: {
            ...preflightReport,
            [field]: value,
          },
        }),
      /preflight_report_must_be_read_only_and_ready/,
    );
  }
});

test("rejects domain, order and SHA mismatches", () => {
  assert.throws(
    () =>
      createHostingerWebsiteCreateDraft({
        ...input,
        domain: "other.apidevelopers.digital",
      }),
    /preview_domain_mismatch/,
  );

  assert.throws(
    () =>
      createHostingerWebsiteCreateDraft({
        ...input,
        orderId: "1009450999",
      }),
    /order_reference_mismatch/,
  );

  assert.throws(
    () =>
      createHostingerWebsiteCreateDraft({
        ...input,
        sourceSha: "not-a-sha",
      }),
    /invalid_source_sha/,
  );
});
