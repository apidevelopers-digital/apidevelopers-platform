import crypto from "node:crypto";

const REQUIRED_SCOPE = "create-isolated-preview-web-app-only";
const REQUIRED_ACTION = "create_preview_web_app";

function requiredString(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

export function createPreviewProvisioningPacket({
  provisioningRequest,
  workflow,
  generatedAt = new Date().toISOString(),
}) {
  if (!provisioningRequest || typeof provisioningRequest !== "object") {
    throw new Error("provisioning_request_missing");
  }

  if (
    provisioningRequest.kind !== "preview-web-app-provisioning-request" ||
    provisioningRequest.mode !== "supervised-request"
  ) {
    throw new Error("unsupported_provisioning_request");
  }

  if (
    provisioningRequest.executable !== false ||
    provisioningRequest.approvalRequired !== true ||
    provisioningRequest.approvalScope !== REQUIRED_SCOPE
  ) {
    throw new Error("provisioning_request_must_remain_blocked");
  }

  const action = provisioningRequest.requestedAction;
  if (
    action?.action !== REQUIRED_ACTION ||
    action?.sensitive !== true ||
    action?.approvalRequired !== true ||
    action?.executable !== false ||
    action?.connectsRepository !== false ||
    action?.configuresDns !== false ||
    action?.deploysArtifact !== false
  ) {
    throw new Error("provisioning_action_scope_violation");
  }

  const invariants = provisioningRequest.invariants ?? {};
  if (
    invariants.preservePrimaryDomain !== true ||
    invariants.preserveCurrentWordPress !== true ||
    invariants.overwriteDns !== false ||
    invariants.wildcardDns !== false ||
    invariants.deployOnCreation !== false ||
    invariants.productionWrites !== false
  ) {
    throw new Error("provisioning_invariants_violation");
  }

  const workflowName = requiredString("workflow.name", workflow?.name);
  const runId = requiredString("workflow.runId", String(workflow?.runId ?? ""));
  const runAttempt = Number(workflow?.runAttempt ?? 0);
  if (!Number.isInteger(runAttempt) || runAttempt < 1) {
    throw new Error("missing_or_invalid:workflow.runAttempt");
  }

  const sourceSha = requiredString("source.sha", provisioningRequest.source?.sha);
  const artifactName = requiredString(
    "source.artifactName",
    provisioningRequest.source?.artifactName,
  );
  const approvalToken = requiredString(
    "approvalToken",
    provisioningRequest.approvalToken,
  );

  const packet = {
    schemaVersion: "1.0",
    kind: "preview-web-app-provisioning-packet",
    mode: "evidence-only",
    executable: false,
    approvalRequired: true,
    approvalScope: REQUIRED_SCOPE,
    generatedAt,
    workflow: {
      name: workflowName,
      runId,
      runAttempt,
      repository: requiredString("workflow.repository", workflow?.repository),
      ref: requiredString("workflow.ref", workflow?.ref),
      runner: {
        type: "self-hosted",
        os: "macOS",
        architecture: "X64",
      },
    },
    source: {
      repository: requiredString(
        "source.repository",
        provisioningRequest.source?.repository,
      ),
      sha: sourceSha,
      artifactName,
    },
    target: provisioningRequest.target,
    application: provisioningRequest.application,
    evidence: {
      requestFingerprint: requiredString(
        "fingerprint",
        provisioningRequest.fingerprint,
      ),
      promotionFingerprint: requiredString(
        "evidence.promotionFingerprint",
        provisioningRequest.evidence?.promotionFingerprint,
      ),
      readinessFingerprint: requiredString(
        "evidence.readinessFingerprint",
        provisioningRequest.evidence?.readinessFingerprint,
      ),
    },
    requestedAction: action,
    deferredActions: [...(provisioningRequest.deferredActions ?? [])],
    invariants: {
      ...invariants,
      packetDoesNotCreateHostingResource: true,
      packetDoesNotConnectRepository: true,
      packetDoesNotConfigureDns: true,
      packetDoesNotDeployArtifact: true,
    },
    approvalToken,
  };

  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(packet))
    .digest("hex");

  return deepFreeze({
    ...packet,
    fingerprint,
  });
}
