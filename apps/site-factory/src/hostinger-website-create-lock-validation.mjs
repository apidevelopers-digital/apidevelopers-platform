import crypto from "node:crypto";

function required(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function assertFalse(name, value) {
  if (value !== false) {
    throw new Error(`${name}_must_be_false`);
  }
}

export function validateExistingExecutionLock({
  lock,
  authorization,
  repository,
}) {
  const { draftInfo, approvalInfo } = authorization ?? {};

  if (
    !lock ||
    typeof lock !== "object" ||
    lock.kind !==
      "hostinger-business-hosting-website-create-execution-lock" ||
    lock.status !== "claimed" ||
    lock.singleUse !== true ||
    lock.executable !== false ||
    lock.hostinger?.postEndpoint !== "/api/hosting/v1/websites" ||
    lock.hostinger?.postExecuted !== false
  ) {
    throw new Error("execution_lock_contract_invalid");
  }

  const fingerprint = required("lock.fingerprint", lock.fingerprint);
  const unsigned = { ...lock };
  delete unsigned.fingerprint;

  if (digest(unsigned) !== fingerprint) {
    throw new Error("execution_lock_fingerprint_mismatch");
  }

  if (
    lock.source?.repository !== required("repository", repository) ||
    lock.source?.draftFingerprint !== draftInfo?.fingerprint ||
    lock.source?.approvalFingerprint !== approvalInfo?.fingerprint
  ) {
    throw new Error("execution_lock_source_mismatch");
  }

  if (
    !/^[a-f0-9]{40}$/.test(
      required("lock.source.sourceSha", lock.source?.sourceSha),
    ) ||
    !required(
      "lock.source.workflowRunId",
      String(lock.source?.workflowRunId ?? ""),
    )
  ) {
    throw new Error("execution_lock_provenance_invalid");
  }

  const claimedAt = Date.parse(required("lock.claimedAt", lock.claimedAt));
  if (!Number.isFinite(claimedAt)) {
    throw new Error("execution_lock_claimed_at_invalid");
  }

  if (
    lock.target?.domain !== draftInfo?.domain ||
    lock.target?.datacenterCode !== draftInfo?.datacenterCode ||
    lock.target?.orderReference !==
      `order-****${draftInfo?.orderId?.slice(-4)}`
  ) {
    throw new Error("execution_lock_target_mismatch");
  }

  for (const [name, value] of Object.entries({
    connectRepository: lock.constraints?.connectRepository,
    configureDns: lock.constraints?.configureDns,
    uploadArchive: lock.constraints?.uploadArchive,
    startNodeBuild: lock.constraints?.startNodeBuild,
    deployArtifact: lock.constraints?.deployArtifact,
    productionWrites: lock.constraints?.productionWrites,
    wordpressChanges: lock.constraints?.wordpressChanges,
  })) {
    assertFalse(`execution_lock.constraints.${name}`, value);
  }

  return Object.freeze({
    fingerprint,
    claimedAt: lock.claimedAt,
    sourceSha: lock.source.sourceSha,
    workflowRunId: String(lock.source.workflowRunId),
  });
}
