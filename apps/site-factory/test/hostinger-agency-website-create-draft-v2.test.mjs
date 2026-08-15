import test from "node:test";
import assert from "node:assert/strict";
import {
  HOSTINGER_AGENCY_WEBSITE_CREATE_V2_CONTRACT,
  createHostingerAgencyWebsiteCreateDraftV2,
} from "../src/hostinger-agency-website-create-draft-v2.mjs";

const preflight = {
  kind: "hostinger-business-hosting-preview-preflight",
  mode: "read-only",
  executable: false,
  writesEnabled: false,
  provisioningEnabled: false,
  dnsEnabled: false,
  deployEnabled: false,
  readyForProvisioningApproval: true,
  checkedAt: "2026-08-15T01:00:00.000Z",
  orderReference: "order-***0581",
  fingerprint: "a".repeat(64),
  datacenters: [{ code: "br-1", title: "Brazil" }],
};

const input = {
  domain: "api.apidevelopers.digital",
  expectedDomain: "api.apidevelopers.digital",
  orderId: "1009450581",
  datacenterCode: "br-1",
  preflightReport: preflight,
  sourceRepository: "apidevelopers-digital/apidevelopers-platform",
  sourceSha: "b".repeat(40),
  generatedAt: "2026-08-15T01:10:00.000Z",
};

test("creates deterministic fail-closed Agency Hosting v2 draft", () => {
  const a = createHostingerAgencyWebsiteCreateDraftV2(input);
  const b = createHostingerAgencyWebsiteCreateDraftV2(input);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.equal(a.executable, false);
  assert.equal(a.writesEnabled, false);
  assert.equal(a.dnsEnabled, false);
  assert.equal(a.nodeBuildEnabled, false);
  assert.equal(a.deployEnabled, false);
  assert.equal(a.apiContract.create.execute, false);
  assert.equal(a.apiContract.status.readOnly, true);
  assert.equal(a.request.payload.flavor, "php-fpm");
  assert.equal(a.request.payload.settings.php.version, "8.3");
  assert.match(a.approvalToken, /^IGOR_APROVA_AGENCY_WEBSITE_CREATE_V2_[A-F0-9]{12}$/);
});

test("rejects domain mismatch and unapproved datacenter", () => {
  assert.throws(
    () => createHostingerAgencyWebsiteCreateDraftV2({ ...input, expectedDomain: "gateway.apidevelopers.digital" }),
    /target_domain_mismatch/,
  );
  assert.throws(
    () => createHostingerAgencyWebsiteCreateDraftV2({ ...input, datacenterCode: "us-1" }),
    /datacenter_not_in_preflight/,
  );
});

test("pins current asynchronous API contract", () => {
  assert.deepEqual(HOSTINGER_AGENCY_WEBSITE_CREATE_V2_CONTRACT, {
    createEndpoint: "/api/agency-hosting/v1/orders/{order_id}/websites/setups",
    statusEndpoint: "/api/agency-hosting/v1/orders/{order_id}/websites/setups/{setup_uuid}",
    createMethod: "POST",
    statusMethod: "GET",
    asynchronous: true,
    setupIdentifier: "setup_uuid",
    websiteIdentifier: "website_uid",
  });
});
