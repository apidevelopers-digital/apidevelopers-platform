import { createHash } from "node:crypto";
import { assertSignedVaultAccessDecisionReceipt } from "./signed-vault-access-decision-receipt-v1.mjs";

export const TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_CHAIN_V1 = Object.freeze({
  version: "trust-face-signed-vault-access-decision-chain/v1",
  purpose: "chain-lab-signed-vault-access-decision-receipt-digests",
  mode: "simulation-lab-only",
  metadataOnly: true,
  appendOnlySequenceRequired: true,
  chainIntegrityVerifiedInLab: true,
  decisionReceiptPayloadStored: false,
  proofPayloadStored: false,
  signatureStored: false,
  publicKeyStored: false,
  privateKeyAccepted: false,
  privateKeyStored: false,
  rawBiometricPayloadAccepted: false,
  rawEmbeddingAccepted: false,
  ciphertextStored: false,
  kmsMaterialAccepted: false,
  externalAuditSinkIntegrated: false,
  productionAuditStoreIntegrated: false,
  cryptographicTimestampAuthorityIntegrated: false,
  realVaultAccessAuthorized: false,
  realVaultReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceSignedVaultAccessDecisionChainV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceSignedVaultAccessDecisionChainV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceSignedVaultAccessDecisionChainV1Error(code, message);
};
const req = (value, field) => {
  if (typeof value !== "string" || !value.trim()) fail("invalid_signed_vault_access_decision_chain_field", `${field} is required`);
  return value.trim();
};
const digest = (value, field) => {
  const normalized = req(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) fail("invalid_signed_vault_access_decision_chain_digest", `${field} must be sha256:<64 hex>`);
  return normalized;
};
const iso = (value, field) => {
  const normalized = req(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) fail("invalid_signed_vault_access_decision_chain_time", `${field} must be ISO-8601`);
  return new Date(ms).toISOString();
};
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const sha = (value) => `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;

const forbidden = new Set([
  "image","imageData","rawImage","pixels","video","videoData","frames","bytes","buffer",
  "embedding","embeddings","vector","vectors","template","biometricTemplate","templatePayload",
  "ciphertext","encryptedPayload","encryptedTemplate","payload","privateKey","keyMaterial","kmsMaterial",
  "secret","secretMaterial","plaintext","signature"
]);
function rejectSensitive(value, seen = new Set()) {
  if (value == null || typeof value !== "object") return;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) fail("signed_vault_access_decision_chain_binary_forbidden", "binary input is forbidden");
  if (seen.has(value)) fail("signed_vault_access_decision_chain_circular_input", "circular input is forbidden");
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) fail("signed_vault_access_decision_chain_sensitive_payload_forbidden", `${key} is forbidden`);
    rejectSensitive(child, seen);
  }
  seen.delete(value);
}

function normalizedReceipt(receipt) {
  rejectSensitive(receipt);
  const asserted = assertSignedVaultAccessDecisionReceipt(receipt);
  if (!asserted?.valid) fail("signed_vault_access_decision_receipt_invalid", "decision receipt must be valid");
  return Object.freeze({
    decisionId: req(receipt.decisionId, "decisionReceipt.decisionId"),
    decisionReceiptDigest: digest(receipt.decisionReceiptDigest, "decisionReceipt.decisionReceiptDigest"),
  });
}

function buildEntry({ sequence, decisionReceipt, previousChainDigest = null, appendedAt }) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) fail("invalid_signed_vault_access_decision_chain_sequence", "sequence must be a positive safe integer");
  const receipt = normalizedReceipt(decisionReceipt);
  const normalizedPrevious = sequence === 1
    ? (previousChainDigest == null ? null : fail("signed_vault_access_decision_chain_genesis_previous_digest_forbidden", "genesis entry must not have previousChainDigest"))
    : digest(previousChainDigest, "previousChainDigest");
  const body = Object.freeze({
    version: TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_CHAIN_V1.version,
    purpose: TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_CHAIN_V1.purpose,
    mode: TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_CHAIN_V1.mode,
    sequence,
    decisionId: receipt.decisionId,
    decisionReceiptDigest: receipt.decisionReceiptDigest,
    previousChainDigest: normalizedPrevious,
    appendedAt: iso(appendedAt, "appendedAt"),
    metadataOnly: true,
    decisionReceiptPayloadStored: false,
    proofPayloadStored: false,
    signatureStored: false,
    publicKeyStored: false,
    privateKeyStored: false,
    rawBiometricPayloadStored: false,
    rawEmbeddingStored: false,
    ciphertextStored: false,
    productionReady: false,
  });
  return Object.freeze({ ...body, chainDigest: sha(body) });
}

export function createSignedVaultAccessDecisionChainEntry(input = {}) {
  rejectSensitive({
    previousChainDigest: input.previousChainDigest,
    appendedAt: input.appendedAt,
  });
  return buildEntry(input);
}

export function assertSignedVaultAccessDecisionChainEntry({
  entry,
  decisionReceipt,
  expectedSequence,
  expectedPreviousChainDigest = null,
} = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail("signed_vault_access_decision_chain_entry_required", "entry is required");
  rejectSensitive(entry);
  if (!Number.isSafeInteger(expectedSequence) || expectedSequence < 1) fail("invalid_signed_vault_access_decision_chain_expected_sequence", "expectedSequence must be a positive safe integer");
  const rebuilt = buildEntry({
    sequence: expectedSequence,
    decisionReceipt,
    previousChainDigest: expectedPreviousChainDigest,
    appendedAt: entry.appendedAt,
  });
  for (const field of [
    "version","purpose","mode","sequence","decisionId","decisionReceiptDigest","previousChainDigest","appendedAt",
    "metadataOnly","decisionReceiptPayloadStored","proofPayloadStored","signatureStored","publicKeyStored","privateKeyStored",
    "rawBiometricPayloadStored","rawEmbeddingStored","ciphertextStored","productionReady","chainDigest"
  ]) {
    if (entry[field] !== rebuilt[field]) fail("signed_vault_access_decision_chain_entry_tampered", `${field} mismatch`);
  }
  return Object.freeze({
    valid: true,
    sequence: rebuilt.sequence,
    decisionId: rebuilt.decisionId,
    chainDigest: rebuilt.chainDigest,
    previousChainDigest: rebuilt.previousChainDigest,
    productionReady: false,
  });
}

export function verifySignedVaultAccessDecisionChain({ entries, decisionReceipts } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) fail("signed_vault_access_decision_chain_entries_required", "entries must be a non-empty array");
  if (!Array.isArray(decisionReceipts) || decisionReceipts.length !== entries.length) {
    fail("signed_vault_access_decision_chain_receipt_count_mismatch", "decisionReceipts must match entries length");
  }
  let previousChainDigest = null;
  const seenDecisionIds = new Set();
  let firstDecisionId = null;
  let lastDecisionId = null;
  for (let index = 0; index < entries.length; index += 1) {
    const expectedSequence = index + 1;
    const receipt = normalizedReceipt(decisionReceipts[index]);
    if (seenDecisionIds.has(receipt.decisionId)) fail("signed_vault_access_decision_chain_duplicate_decision", `duplicate decisionId ${receipt.decisionId}`);
    seenDecisionIds.add(receipt.decisionId);
    const checked = assertSignedVaultAccessDecisionChainEntry({
      entry: entries[index],
      decisionReceipt: decisionReceipts[index],
      expectedSequence,
      expectedPreviousChainDigest: previousChainDigest,
    });
    if (firstDecisionId == null) firstDecisionId = checked.decisionId;
    lastDecisionId = checked.decisionId;
    previousChainDigest = checked.chainDigest;
  }
  return Object.freeze({
    valid: true,
    entryCount: entries.length,
    firstDecisionId,
    lastDecisionId,
    headChainDigest: previousChainDigest,
    metadataOnly: true,
    productionReady: false,
    biometricClaimReady: false,
  });
}
