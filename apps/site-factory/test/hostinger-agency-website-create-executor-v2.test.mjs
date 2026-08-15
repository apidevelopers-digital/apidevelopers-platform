import test from "node:test";
import assert from "node:assert/strict";

import {
  executeApprovedAgencyWebsiteCreateV2,
  HOSTINGER_AGENCY_WEBSITE_EXECUTOR_V2_POLICY,
} from "../src/hostinger-agency-website-create-executor-v2.mjs";
import {
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
  checkedAt: "2026-08-15T02:00:00.000Z",
  orderReference: "order-***0581",
  fingerprint: "a".repeat(64),
  datacenters: [{ code: "br-1", title: "Brazil" }],
};

function draft() {
  return createHostingerAgencyWebsiteCreateDraftV2({
    domain: "api.apidevelopers.digital",
    expectedDomain: "api.apidevelopers.digital",
    orderId: "1009450581",
    datacenterCode: "br-1",
    preflightReport: preflight,
    sourceRepository: "apidevelopers-digital/apidevelopers-platform",
    sourceSha: "b".repeat(40),
    generatedAt: "2026-08-15T02:05:00.000Z",
  });
}

test("executes one create adapter and one read-only completion adapter", async () => {
  const item = draft();
  let creates = 0;
  let polls = 0;

  const result = await executeApprovedAgencyWebsiteCreateV2({
    token: "test-token-not-real",
    draft: item,
    expectedFingerprint: item.fingerprint,
    approvalToken: item.approvalToken,
    expectedDomain: "api.apidevelopers.digital",
    createSetupImpl: async ({ orderId, payload }) => {
      creates += 1;
      assert.equal(orderId, "1009450581");
      assert.equal(payload.domain, "api.apidevelopers.digital");
      return { accepted: true, setupUuid: "setup-123" };
    },
    waitForSetupImpl: async ({ orderId, setupUuid }) => {
      polls += 1;
      assert.equal(orderId, "1009450581");
      assert.equal(setupUuid, "setup-123");
      return { completed: true, status: "completed", websiteUid: "website-456" };
    },
  });

  assert.equal(creates, 1);
  assert.equal(polls, 1);
  assert.equal(result.websiteUid, "website-456");
  assert.equal(result.hostinger.createPostCount, 1);
  assert.equal(result.hostinger.dnsConfigured, false);
  assert.equal(result.hostinger.nodeBuildStarted, false);
  assert.equal(result.hostinger.artifactDeployed, false);
  assert.doesNotMatch(JSON.stringify(result), /test-token-not-real/);
});

test("rejects wrong fingerprint before any adapter call", async () => {
  const item = draft();
  let creates = 0;

  await assert.rejects(
    () => executeApprovedAgencyWebsiteCreateV2({
      token: "test-token-not-real",
      draft: item,
      expectedFingerprint: "c".repeat(64),
      approvalToken: item.approvalToken,
      expectedDomain: "api.apidevelopers.digital",
      createSetupImpl: async () => {
        creates += 1;
        return { accepted: true, setupUuid: "never" };
      },
    }),
    /fingerprint_mismatch/,
  );

  assert.equal(creates, 0);
});

test("keeps executor scope limited to website creation only", () => {
  assert.deepEqual(HOSTINGER_AGENCY_WEBSITE_EXECUTOR_V2_POLICY, {
    approvalScope: "create-agency-website-only",
    createPostCount: 1,
    statusPollingReadOnly: true,
    dnsConfigured: false,
    nodeBuildStarted: false,
    artifactDeployed: false,
  });
});
