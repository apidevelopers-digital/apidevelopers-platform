
import crypto from "node:crypto";

export const CREATE_ENDPOINT = "/api/hosting/v1/websites";

function required(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function unsigned(value, keys) {
  const clone = { ...value };
  for (const key of keys) delete clone[key];
  return clone;
}

function assertFalse(name, value) {
  if (value !== false) throw new Error(`${name}_must_be_false`);
}

function timestamp(name, value) {
  const parsed = Date.parse(required(name, value));
  if (!Number.isFinite(parsed)) throw new Error(`invalid_timestamp:${name}`);
  return parsed;
}

function validateDraft({
  draft,
  expectedFingerprint,
  expectedRepository,
  nowMs,
  maxDraftAgeMs,
}) {
  if (
    draft?.kind !== "hostinger-business-hosting-website-create-draft" ||
    draft.mode !== "approval-draft" ||
    draft.executable !== false ||
    draft.approvalRequired !== true ||
    draft.approvalScope !== "create-isolated-preview-website-only"
  ) {
    throw new Error("draft_contract_invalid");
  }

  for (const [name, value] of [
    ["writesEnabled", draft.writesEnabled],
    ["provisioningEnabled", draft.provisioningEnabled],
    ["dnsEnabled", draft.dnsEnabled],
    ["deployEnabled", draft.deployEnabled],
    ["request.execute", draft.request?.execute],
    ["connectRepository", draft.invariants?.connectRepository],
    ["configureDns", draft.invariants?.configureDns],
    ["uploadArchive", draft.invariants?.uploadArchive],
    ["startNodeBuild", draft.invariants?.startNodeBuild],
    ["deployArtifact", draft.invariants?.deployArtifact],
    ["productionWrites", draft.invariants?.productionWrites],
  ]) {
    assertFalse(`draft.${name}`, value);
  }

  if (
    draft.request?.method !== "POST" ||
    draft.request?.endpoint !== CREATE_ENDPOINT
  ) {
    throw new Error("draft_endpoint_invalid");
  }

  const fingerprint = required("draft.fingerprint", draft.fingerprint);
  if (fingerprint !== required("expectedFingerprint", expectedFingerprint)) {
    throw new Error("draft_fingerprint_unexpected");
  }
  if (digest(unsigned(draft, ["fingerprint", "approvalToken"])) !== fingerprint) {
    throw new Error("draft_fingerprint_mismatch");
  }

  const approvalToken =
    `IGOR_APROVA_CRIACAO_WEBSITE_PREVIEW_${fingerprint
      .slice(0, 12)
      .toUpperCase()}`;
  if (draft.approvalToken !== approvalToken) {
    throw new Error("draft_approval_token_mismatch");
  }

  const domain = required(
    "draft.request.payload.domain",
    draft.request?.payload?.domain,
  ).toLowerCase();
  const orderId = required(
    "draft.request.payload.order_id",
    String(draft.request?.payload?.order_id ?? ""),
  );
  const datacenterCode = required(
    "draft.request.payload.datacenter_code",
    draft.request?.payload?.datacenter_code,
  );

  if (!/^[0-9]+$/.test(orderId)) throw new Error("draft_order_id_invalid");
  if (draft.selectedDatacenter?.code !== datacenterCode) {
    throw new Error("draft_datacenter_mismatch");
  }
  if (draft.source?.repository !== expectedRepository) {
    throw new Error("draft_repository_mismatch");
  }
  if (!/^[a-f0-9]{40}$/.test(required("draft.source.sha", draft.source?.sha))) {
    throw new Error("draft_source_sha_invalid");
  }

  const generatedAtMs = timestamp("draft.generatedAt", draft.generatedAt);
  if (generatedAtMs > nowMs + 5 * 60 * 1000) {
    throw new Error("draft_generated_in_future");
  }
  if (nowMs - generatedAtMs > maxDraftAgeMs) {
    throw new Error("draft_expired");
  }

  return {
    fingerprint,
    approvalToken,
    domain,
    orderId,
    datacenterCode,
    sourceSha: draft.source.sha,
  };
}

function validateApproval({ approval, draftInfo, expectedRepository, nowMs }) {
  if (
    approval?.kind !==
      "hostinger-business-hosting-website-create-approval" ||
    approval.status !== "approved" ||
    approval.singleUse !== true ||
    approval.consumed !== false ||
    approval.scope !== "create-isolated-preview-website-only" ||
    approval.approvedBy !== "Igor"
  ) {
    throw new Error("approval_contract_invalid");
  }

  if (digest(unsigned(approval, ["fingerprint"])) !== approval.fingerprint) {
    throw new Error("approval_fingerprint_mismatch");
  }
  if (approval.approvedFingerprint !== draftInfo.fingerprint) {
    throw new Error("approval_draft_fingerprint_mismatch");
  }

  const tokenDigest = crypto
    .createHash("sha256")
    .update(draftInfo.approvalToken)
    .digest("hex");
  if (approval.approvalTokenDigest !== tokenDigest) {
    throw new Error("approval_token_digest_mismatch");
  }
  if (approval.source?.repository !== expectedRepository) {
    throw new Error("approval_repository_mismatch");
  }

  const approvedAtMs = timestamp("approval.approvedAt", approval.approvedAt);
  const expiresAtMs = timestamp("approval.expiresAt", approval.expiresAt);
  if (approvedAtMs > nowMs + 5 * 60 * 1000) {
    throw new Error("approval_from_future");
  }
  if (nowMs > expiresAtMs) throw new Error("approval_expired");

  if (
    approval.constraints?.domain !== draftInfo.domain ||
    approval.constraints?.datacenterCode !== draftInfo.datacenterCode ||
    approval.constraints?.orderReference !==
      `order-****${draftInfo.orderId.slice(-4)}`
  ) {
    throw new Error("approval_constraints_mismatch");
  }

  for (const [name, value] of Object.entries({
    connectRepository: approval.constraints?.connectRepository,
    configureDns: approval.constraints?.configureDns,
    uploadArchive: approval.constraints?.uploadArchive,
    startNodeBuild: approval.constraints?.startNodeBuild,
    deployArtifact: approval.constraints?.deployArtifact,
    productionWrites: approval.constraints?.productionWrites,
    wordpressChanges: approval.constraints?.wordpressChanges,
  })) {
    assertFalse(`approval.constraints.${name}`, value);
  }

  return {
    fingerprint: required("approval.fingerprint", approval.fingerprint),
    approvedAt: approval.approvedAt,
    expiresAt: approval.expiresAt,
  };
}

export function validateCreateAuthorization({
  draft,
  approval,
  expectedFingerprint,
  expectedRepository,
  now = new Date(),
  maxDraftAgeMs = 2 * 60 * 60 * 1000,
}) {
  const nowMs = now.getTime();
  const draftInfo = validateDraft({
    draft,
    expectedFingerprint,
    expectedRepository,
    nowMs,
    maxDraftAgeMs,
  });
  const approvalInfo = validateApproval({
    approval,
    draftInfo,
    expectedRepository,
    nowMs,
  });
  return Object.freeze({ draftInfo, approvalInfo });
}

export function buildExecutionEvidence({
  result,
  repository,
  executionSha,
  workflowRunId,
  executedAt = new Date().toISOString(),
}) {
  const body = {
    schemaVersion: "1.0",
    kind: "hostinger-business-hosting-website-create-execution-evidence",
    mode: "api-root-evidence",
    executable: false,
    executedAt,
    provider: "hostinger",
    product: "business-web-hosting",
    source: {
      repository: required("repository", repository),
      executionSha: required("executionSha", executionSha),
      workflowRunId: required("workflowRunId", String(workflowRunId ?? "")),
      draftFingerprint: result.draftInfo.fingerprint,
      approvalFingerprint: result.approvalInfo.fingerprint,
    },
    outcome: result.outcome,
    hostinger: {
      postExecuted: result.hostingerPostExecuted,
      postEndpoint: CREATE_ENDPOINT,
      postStatus: result.hostingerPostStatus,
      domain: result.website.domain,
      datacenterCode: result.draftInfo.datacenterCode,
      orderReference: `order-****${result.draftInfo.orderId.slice(-4)}`,
      website: result.website,
    },
    approval: {
      consumed: true,
      singleUse: true,
      approvedAt: result.approvalInfo.approvedAt,
      expiresAt: result.approvalInfo.expiresAt,
    },
    constraints: {
      connectRepositoryExecuted: false,
      dnsChanged: false,
      archiveUploaded: false,
      nodeBuildStarted: false,
      deployExecuted: false,
      productionChanged: false,
      wordpressChanged: false,
    },
  };
  return Object.freeze({ ...body, fingerprint: digest(body) });
}
