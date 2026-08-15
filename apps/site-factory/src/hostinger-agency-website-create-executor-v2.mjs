import {
  createAgencyWebsiteSetup,
  waitForAgencyWebsiteSetup,
} from "./hostinger-agency-website-setup.mjs";

function required(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
}

function assertDraftV2({ draft, expectedFingerprint, approvalToken, expectedDomain }) {
  if (!draft || typeof draft !== "object") {
    throw new Error("agency_v2_draft_missing");
  }

  const fingerprint = required("expectedFingerprint", expectedFingerprint);
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new Error("invalid_expected_fingerprint");
  }
  if (draft.fingerprint !== fingerprint) {
    throw new Error("agency_v2_fingerprint_mismatch");
  }

  const expectedApproval =
    `IGOR_APROVA_AGENCY_WEBSITE_CREATE_V2_${fingerprint.slice(0, 12).toUpperCase()}`;
  if (required("approvalToken", approvalToken) !== expectedApproval) {
    throw new Error("agency_v2_approval_mismatch");
  }
  if (draft.approvalToken !== expectedApproval) {
    throw new Error("agency_v2_draft_approval_mismatch");
  }

  if (
    draft.schemaVersion !== "2.0" ||
    draft.kind !== "hostinger-agency-website-create-draft-v2" ||
    draft.mode !== "approval-draft" ||
    draft.executable !== false ||
    draft.approvalRequired !== true ||
    draft.approvalScope !== "create-agency-website-only" ||
    draft.writesEnabled !== false ||
    draft.provisioningEnabled !== false ||
    draft.dnsEnabled !== false ||
    draft.nodeBuildEnabled !== false ||
    draft.deployEnabled !== false ||
    draft.productionWrites !== false
  ) {
    throw new Error("agency_v2_draft_not_fail_closed");
  }

  if (
    draft.apiContract?.create?.method !== "POST" ||
    draft.apiContract?.create?.asynchronous !== true ||
    draft.apiContract?.create?.execute !== false ||
    draft.apiContract?.status?.method !== "GET" ||
    draft.apiContract?.status?.readOnly !== true ||
    draft.apiContract?.setupIdentifier !== "setup_uuid" ||
    draft.apiContract?.websiteIdentifier !== "website_uid"
  ) {
    throw new Error("agency_v2_api_contract_mismatch");
  }

  if (
    draft.invariants?.singleCreatePostAfterApproval !== true ||
    draft.invariants?.statusPollingIsReadOnly !== true ||
    draft.invariants?.configureDns !== false ||
    draft.invariants?.startNodeBuild !== false ||
    draft.invariants?.uploadArchive !== false ||
    draft.invariants?.deployArtifact !== false
  ) {
    throw new Error("agency_v2_invariants_mismatch");
  }

  const domain = required("draft.request.payload.domain", draft.request?.payload?.domain);
  if (expectedDomain && domain !== required("expectedDomain", expectedDomain)) {
    throw new Error("agency_v2_domain_mismatch");
  }

  required("draft.request.order_id", String(draft.request?.order_id ?? ""));
  required("draft.request.payload.datacenter_code", draft.request?.payload?.datacenter_code);

  return Object.freeze({
    fingerprint,
    approvalToken: expectedApproval,
    domain,
    orderId: String(draft.request.order_id),
    payload: draft.request.payload,
  });
}

export async function executeApprovedAgencyWebsiteCreateV2({
  token,
  draft,
  expectedFingerprint,
  approvalToken,
  expectedDomain,
  createSetupImpl = createAgencyWebsiteSetup,
  waitForSetupImpl = waitForAgencyWebsiteSetup,
}) {
  const authorization = assertDraftV2({
    draft,
    expectedFingerprint,
    approvalToken,
    expectedDomain,
  });

  const created = await createSetupImpl({
    token: required("HOSTINGER_API_TOKEN", token),
    orderId: authorization.orderId,
    payload: authorization.payload,
  });

  if (!created?.accepted || !created?.setupUuid) {
    throw new Error("agency_v2_setup_not_accepted");
  }

  const completed = await waitForSetupImpl({
    token,
    orderId: authorization.orderId,
    setupUuid: created.setupUuid,
  });

  if (!completed?.completed || !completed?.websiteUid) {
    throw new Error("agency_v2_setup_not_completed");
  }

  return Object.freeze({
    status: "completed",
    outcome: "website_created",
    domain: authorization.domain,
    setupUuid: created.setupUuid,
    websiteUid: completed.websiteUid,
    source: {
      draftFingerprint: authorization.fingerprint,
      approvalConsumed: true,
    },
    hostinger: {
      createPostExecuted: true,
      createPostCount: 1,
      statusPollingReadOnly: true,
      dnsConfigured: false,
      nodeBuildStarted: false,
      artifactDeployed: false,
    },
  });
}

export const HOSTINGER_AGENCY_WEBSITE_EXECUTOR_V2_POLICY = Object.freeze({
  approvalScope: "create-agency-website-only",
  createPostCount: 1,
  statusPollingReadOnly: true,
  dnsConfigured: false,
  nodeBuildStarted: false,
  artifactDeployed: false,
});
