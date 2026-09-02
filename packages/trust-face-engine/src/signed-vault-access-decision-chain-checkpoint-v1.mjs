import { createHash } from "node:crypto";
import { verifySignedVaultAccessDecisionChain } from "./signed-vault-access-decision-chain-v1.mjs";

export const TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_CHAIN_CHECKPOINT_V1 = Object.freeze({
  version: "trust-face-signed-vault-access-decision-chain-checkpoint/v1",
  purpose: "checkpoint-verified-lab-signed-vault-access-decision-chain-head",
  mode: "simulation-lab-only",
  metadataOnly: true,
  chainIntegrityVerifiedBeforeCheckpoint: true,
  checkpointIntegrityVerifiedInLab: true,
  checkpointSigningPerformed: false,
  signatureStored: false,
  publicKeyStored: false,
  privateKeyAccepted: false,
  privateKeyStored: false,
  decisionReceiptPayloadStored: false,
  proofPayloadStored: false,
  rawBiometricPayloadAccepted: false,
  rawEmbeddingAccepted: false,
  ciphertextStored: false,
  kmsMaterialAccepted: false,
  externalAuditSinkIntegrated: false,
  productionAuditStoreIntegrated: false,
  cryptographicTimestampAuthorityIntegrated: false,
  externalCheckpointAnchorIntegrated: false,
  realVaultAccessAuthorized: false,
  realVaultReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceSignedVaultAccessDecisionChainCheckpointV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceSignedVaultAccessDecisionChainCheckpointV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceSignedVaultAccessDecisionChainCheckpointV1Error(code, message);
};

const req = (value, field) => {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_signed_vault_access_decision_chain_checkpoint_field", `${field} is required`);
  }
  return value.trim();
};

const digest = (value, field) => {
  const normalized = req(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    fail("invalid_signed_vault_access_decision_chain_checkpoint_digest", `${field} must be sha256:<64 hex>`);
  }
  return normalized;
};

const digestOrNull = (value, field) => {
  if (value == null) return null;
  return digest(value, field);
};

const iso = (value, field) => {
  const normalized = req(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) {
    fail("invalid_signed_vault_access_decision_chain_checkpoint_time", `${field} must be ISO-8601`);
  }
  return new Date(ms).toISOString();
};

const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha = (value) =>
  `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;

const forbidden = new Set([
  "image", "imageData", "rawImage", "pixels", "video", "videoData", "frames", "bytes", "buffer",
  "embedding", "embeddings", "vector", "vectors", "template", "biometricTemplate", "templatePayload",
  "ciphertext", "encryptedPayload", "encryptedTemplate", "payload", "privateKey", "keyMaterial", "kmsMaterial",
  "secret", "secretMaterial", "plaintext", "signature",
]);

function rejectSensitive(value, seen = new Set()) {
  if (value == null || typeof value !== "object") return;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    fail("signed_vault_access_decision_chain_checkpoint_binary_forbidden", "binary input is forbidden");
  }
  if (seen.has(value)) {
    fail("signed_vault_access_decision_chain_checkpoint_circular_input", "circular input is forbidden");
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) {
      fail("signed_vault_access_decision_chain_checkpoint_sensitive_payload_forbidden", `${key} is forbidden`);
    }
    rejectSensitive(child, seen);
  }
  seen.delete(value);
}

function buildCheckpoint({
  checkpointId,
  verifiedChain,
  checkpointAt,
  previousCheckpointDigest = null,
}) {
  const body = Object.freeze({
    version: TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_CHAIN_CHECKPOINT_V1.version,
    purpose: TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_CHAIN_CHECKPOINT_V1.purpose,
    mode: TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_CHAIN_CHECKPOINT_V1.mode,
    checkpointId: req(checkpointId, "checkpointId"),
    entryCount: verifiedChain.entryCount,
    firstDecisionId: req(verifiedChain.firstDecisionId, "verifiedChain.firstDecisionId"),
    lastDecisionId: req(verifiedChain.lastDecisionId, "verifiedChain.lastDecisionId"),
    headChainDigest: digest(verifiedChain.headChainDigest, "verifiedChain.headChainDigest"),
    previousCheckpointDigest: digestOrNull(previousCheckpointDigest, "previousCheckpointDigest"),
    checkpointAt: iso(checkpointAt, "checkpointAt"),
    metadataOnly: true,
    chainIntegrityVerifiedBeforeCheckpoint: true,
    checkpointSigningPerformed: false,
    signatureStored: false,
    publicKeyStored: false,
    privateKeyStored: false,
    decisionReceiptPayloadStored: false,
    proofPayloadStored: false,
    rawBiometricPayloadStored: false,
    rawEmbeddingStored: false,
    ciphertextStored: false,
    externalAuditSinkIntegrated: false,
    productionAuditStoreIntegrated: false,
    cryptographicTimestampAuthorityIntegrated: false,
    externalCheckpointAnchorIntegrated: false,
    productionReady: false,
  });
  return Object.freeze({
    ...body,
    checkpointDigest: sha(body),
  });
}

export function createSignedVaultAccessDecisionChainCheckpoint({
  checkpointId,
  entries,
  decisionReceipts,
  checkpointAt,
  previousCheckpointDigest = null,
} = {}) {
  rejectSensitive({
    checkpointId,
    entries,
    decisionReceipts,
    checkpointAt,
    previousCheckpointDigest,
  });
  const verifiedChain = verifySignedVaultAccessDecisionChain({ entries, decisionReceipts });
  return buildCheckpoint({
    checkpointId,
    verifiedChain,
    checkpointAt,
    previousCheckpointDigest,
  });
}

export function assertSignedVaultAccessDecisionChainCheckpoint({
  checkpoint,
  entries,
  decisionReceipts,
  expectedPreviousCheckpointDigest,
} = {}) {
  if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) {
    fail("signed_vault_access_decision_chain_checkpoint_required", "checkpoint is required");
  }
  rejectSensitive(checkpoint);
  const verifiedChain = verifySignedVaultAccessDecisionChain({ entries, decisionReceipts });
  const previousCheckpointDigest =
    expectedPreviousCheckpointDigest === undefined
      ? checkpoint.previousCheckpointDigest
      : expectedPreviousCheckpointDigest;

  const rebuilt = buildCheckpoint({
    checkpointId: checkpoint.checkpointId,
    verifiedChain,
    checkpointAt: checkpoint.checkpointAt,
    previousCheckpointDigest,
  });

  for (const field of [
    "version",
    "purpose",
    "mode",
    "checkpointId",
    "entryCount",
    "firstDecisionId",
    "lastDecisionId",
    "headChainDigest",
    "previousCheckpointDigest",
    "checkpointAt",
    "metadataOnly",
    "chainIntegrityVerifiedBeforeCheckpoint",
    "checkpointSigningPerformed",
    "signatureStored",
    "publicKeyStored",
    "privateKeyStored",
    "decisionReceiptPayloadStored",
    "proofPayloadStored",
    "rawBiometricPayloadStored",
    "rawEmbeddingStored",
    "ciphertextStored",
    "externalAuditSinkIntegrated",
    "productionAuditStoreIntegrated",
    "cryptographicTimestampAuthorityIntegrated",
    "externalCheckpointAnchorIntegrated",
    "productionReady",
    "checkpointDigest",
  ]) {
    if (checkpoint[field] !== rebuilt[field]) {
      fail("signed_vault_access_decision_chain_checkpoint_tampered", `${field} mismatch`);
    }
  }

  return Object.freeze({
    valid: true,
    checkpointId: rebuilt.checkpointId,
    entryCount: rebuilt.entryCount,
    headChainDigest: rebuilt.headChainDigest,
    checkpointDigest: rebuilt.checkpointDigest,
    previousCheckpointDigest: rebuilt.previousCheckpointDigest,
    productionReady: false,
  });
}
