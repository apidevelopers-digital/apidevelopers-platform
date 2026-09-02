import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_CHAIN_V1 as PROFILE,
  createSignedVaultAccessDecisionChainEntry,
  assertSignedVaultAccessDecisionChainEntry,
  verifySignedVaultAccessDecisionChain,
} from "../src/signed-vault-access-decision-chain-v1.mjs";

const D = (c) => `sha256:${c.repeat(64)}`;
const shaJson = (value) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

function receipt(id, options = {}) {
  const body = {
    version: "trust-face-signed-vault-access-decision-receipt/v1",
    purpose: "record-lab-signed-vault-access-decision-metadata",
    mode: "simulation-lab-only",
    decisionId: id,
    vaultReceiptId: `vault-${id}`,
    authorizationDigest: D("a"),
    purposeCode: "verification-orchestration",
    keyId: "lab-key-001",
    trustedKeyFingerprint: D("f"),
    proofDigest: D("b"),
    decision: "allow",
    reasonCode: "authorized",
    decisionAt: "2026-09-02T12:00:00.000Z",
    metadataOnly: true,
    proofPayloadStored: false,
    signatureStored: false,
    publicKeyStored: false,
    privateKeyStored: false,
    rawBiometricPayloadStored: false,
    rawEmbeddingStored: false,
    ciphertextStored: false,
    productionReady: false,
    ...options,
  };
  return Object.freeze({ ...body, decisionReceiptDigest: shaJson(body) });
}

test("profile remains lab-only and metadata-only", () => {
  assert.equal(PROFILE.chainIntegrityVerifiedInLab, true);
  assert.equal(PROFILE.metadataOnly, true);
  for (const field of [
    "decisionReceiptPayloadStored","proofPayloadStored","signatureStored","publicKeyStored","privateKeyAccepted",
    "privateKeyStored","rawBiometricPayloadAccepted","rawEmbeddingAccepted","ciphertextStored","kmsMaterialAccepted",
    "externalAuditSinkIntegrated","productionAuditStoreIntegrated","cryptographicTimestampAuthorityIntegrated",
    "realVaultAccessAuthorized","realVaultReady","productionReady","biometricClaimReady"
  ]) assert.equal(PROFILE[field], false);
});

test("creates a valid genesis chain entry", () => {
  const r1 = receipt("decision-001");
  const e1 = createSignedVaultAccessDecisionChainEntry({
    sequence: 1,
    decisionReceipt: r1,
    appendedAt: "2026-09-02T12:01:00Z",
  });
  assert.equal(e1.sequence, 1);
  assert.equal(e1.previousChainDigest, null);
  assert.equal(e1.decisionReceiptDigest, r1.decisionReceiptDigest);
  assert.match(e1.chainDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(assertSignedVaultAccessDecisionChainEntry({
    entry: e1,
    decisionReceipt: r1,
    expectedSequence: 1,
  }).valid, true);
});

test("links a second entry and verifies the whole chain", () => {
  const r1 = receipt("decision-001");
  const r2 = receipt("decision-002", { decisionAt: "2026-09-02T12:02:00.000Z", decision: "deny", reasonCode: "key-revoked" });
  const e1 = createSignedVaultAccessDecisionChainEntry({ sequence: 1, decisionReceipt: r1, appendedAt: "2026-09-02T12:01:00Z" });
  const e2 = createSignedVaultAccessDecisionChainEntry({ sequence: 2, decisionReceipt: r2, previousChainDigest: e1.chainDigest, appendedAt: "2026-09-02T12:03:00Z" });
  const verified = verifySignedVaultAccessDecisionChain({ entries: [e1, e2], decisionReceipts: [r1, r2] });
  assert.equal(verified.valid, true);
  assert.equal(verified.entryCount, 2);
  assert.equal(verified.headChainDigest, e2.chainDigest);
  assert.equal(verified.firstDecisionId, "decision-001");
  assert.equal(verified.lastDecisionId, "decision-002");
});

test("tampered receipt fails closed", () => {
  const r1 = receipt("decision-001");
  const e1 = createSignedVaultAccessDecisionChainEntry({ sequence: 1, decisionReceipt: r1, appendedAt: "2026-09-02T12:01:00Z" });
  const tampered = { ...r1, reasonCode: "tampered" };
  assert.throws(
    () => verifySignedVaultAccessDecisionChain({ entries: [e1], decisionReceipts: [tampered] }),
  );
});

test("broken previous-chain digest fails closed", () => {
  const r1 = receipt("decision-001");
  const r2 = receipt("decision-002", { decisionAt: "2026-09-02T12:02:00.000Z" });
  const e1 = createSignedVaultAccessDecisionChainEntry({ sequence: 1, decisionReceipt: r1, appendedAt: "2026-09-02T12:01:00Z" });
  const e2 = createSignedVaultAccessDecisionChainEntry({ sequence: 2, decisionReceipt: r2, previousChainDigest: e1.chainDigest, appendedAt: "2026-09-02T12:03:00Z" });
  const broken = { ...e2, previousChainDigest: D("e") };
  assert.throws(
    () => verifySignedVaultAccessDecisionChain({ entries: [e1, broken], decisionReceipts: [r1, r2] }),
    (error) => error.code === "signed_vault_access_decision_chain_entry_tampered",
  );
});

test("sequence gaps or reorder fail closed", () => {
  const r1 = receipt("decision-001");
  const r2 = receipt("decision-002", { decisionAt: "2026-09-02T12:02:00.000Z" });
  const e1 = createSignedVaultAccessDecisionChainEntry({ sequence: 1, decisionReceipt: r1, appendedAt: "2026-09-02T12:01:00Z" });
  const e2 = createSignedVaultAccessDecisionChainEntry({ sequence: 2, decisionReceipt: r2, previousChainDigest: e1.chainDigest, appendedAt: "2026-09-02T12:03:00Z" });
  assert.throws(() => verifySignedVaultAccessDecisionChain({ entries: [e2, e1], decisionReceipts: [r2, r1] }));
  assert.throws(() => createSignedVaultAccessDecisionChainEntry({ sequence: 2, decisionReceipt: r2, appendedAt: "2026-09-02T12:03:00Z" }));
});

test("duplicate decision ids are rejected", () => {
  const r1 = receipt("decision-001");
  const r2 = receipt("decision-001");
  const e1 = createSignedVaultAccessDecisionChainEntry({ sequence: 1, decisionReceipt: r1, appendedAt: "2026-09-02T12:01:00Z" });
  const e2 = createSignedVaultAccessDecisionChainEntry({ sequence: 2, decisionReceipt: r2, previousChainDigest: e1.chainDigest, appendedAt: "2026-09-02T12:02:00Z" });
  assert.throws(
    () => verifySignedVaultAccessDecisionChain({ entries: [e1, e2], decisionReceipts: [r1, r2] }),
    (error) => error.code === "signed_vault_access_decision_chain_duplicate_decision",
  );
});

test("sensitive payloads are rejected and no production path is exposed", () => {
  const r1 = { ...receipt("decision-001"), rawImage: "forbidden" };
  assert.throws(
    () => createSignedVaultAccessDecisionChainEntry({ sequence: 1, decisionReceipt: r1, appendedAt: "2026-09-02T12:01:00Z" }),
    (error) => error.code === "signed_vault_access_decision_chain_sensitive_payload_forbidden",
  );
  const moduleSurface = {
    createSignedVaultAccessDecisionChainEntry,
    assertSignedVaultAccessDecisionChainEntry,
    verifySignedVaultAccessDecisionChain,
  };
  for (const field of ["delete","hardDelete","storePrivateKey","getPrivateKey","decrypt","getCiphertext","getKmsMaterial","publish","deploy"]) {
    assert.equal(moduleSurface[field], undefined);
  }
});
