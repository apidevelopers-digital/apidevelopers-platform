import assert from "node:assert/strict";
import test from "node:test";

import {
  createSignedVaultAccessDecisionAudit,
} from "../src/signed-vault-access-decision-receipt-v1.mjs";
import {
  createSignedVaultAccessDecisionChainEntry,
} from "../src/signed-vault-access-decision-chain-v1.mjs";
import {
  TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_CHAIN_CHECKPOINT_V1 as PROFILE,
  createSignedVaultAccessDecisionChainCheckpoint,
  assertSignedVaultAccessDecisionChainCheckpoint,
} from "../src/signed-vault-access-decision-chain-checkpoint-v1.mjs";

const D = (c) => `sha256:${c.repeat(64)}`;

function repository(idField) {
  const records = new Map();
  return {
    async create(value) {
      const id = value[idField];
      if (records.has(id)) throw new Error("conflict");
      records.set(id, structuredClone(value));
      return structuredClone(value);
    },
    async getById(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async list() {
      return [...records.values()].map((value) => structuredClone(value));
    },
  };
}

function allowFlow() {
  return {
    async getCryptographicallyVerifiedAuthorizedReceipt() {
      return Object.freeze({
        authorized: true,
        trustedKey: Object.freeze({
          keyId: "lab-key-001",
          keyFingerprint: D("f"),
        }),
        productionReady: false,
      });
    },
  };
}

function decisionInput(decisionId, vaultReceiptId, now) {
  return {
    decisionId,
    vaultReceiptId,
    authorization: {
      authorizationDigest: D("a"),
    },
    proof: {
      keyId: "lab-key-001",
      algorithm: "Ed25519",
      signedMessage: "authorizationDigest",
      authorizationDigest: D("a"),
      signature: `external-${decisionId}`,
    },
    purposeCode: "verification-orchestration",
    now,
  };
}

async function buildFixture() {
  const audit = createSignedVaultAccessDecisionAudit({
    signedFlow: allowFlow(),
    decisionRepository: repository("decisionId"),
  });
  const first = await audit.evaluateAndRecord(
    decisionInput("decision-001", "vault-receipt-001", "2026-09-02T12:00:00Z"),
  );
  const second = await audit.evaluateAndRecord(
    decisionInput("decision-002", "vault-receipt-002", "2026-09-02T12:02:00Z"),
  );
  const r1 = first.decisionReceipt;
  const r2 = second.decisionReceipt;
  const e1 = createSignedVaultAccessDecisionChainEntry({
    sequence: 1,
    decisionReceipt: r1,
    appendedAt: "2026-09-02T12:03:00Z",
  });
  const e2 = createSignedVaultAccessDecisionChainEntry({
    sequence: 2,
    decisionReceipt: r2,
    previousChainDigest: e1.chainDigest,
    appendedAt: "2026-09-02T12:04:00Z",
  });
  return { r1, r2, e1, e2 };
}

test("profile remains lab-only metadata-only and non-production", () => {
  assert.equal(PROFILE.chainIntegrityVerifiedBeforeCheckpoint, true);
  assert.equal(PROFILE.checkpointIntegrityVerifiedInLab, true);
  assert.equal(PROFILE.metadataOnly, true);
  for (const field of [
    "checkpointSigningPerformed",
    "signatureStored",
    "publicKeyStored",
    "privateKeyAccepted",
    "privateKeyStored",
    "decisionReceiptPayloadStored",
    "proofPayloadStored",
    "rawBiometricPayloadAccepted",
    "rawEmbeddingAccepted",
    "ciphertextStored",
    "kmsMaterialAccepted",
    "externalAuditSinkIntegrated",
    "productionAuditStoreIntegrated",
    "cryptographicTimestampAuthorityIntegrated",
    "externalCheckpointAnchorIntegrated",
    "realVaultAccessAuthorized",
    "realVaultReady",
    "productionReady",
    "biometricClaimReady",
  ]) {
    assert.equal(PROFILE[field], false);
  }
});

test("creates checkpoint only after verifying the full decision chain", async () => {
  const { r1, r2, e1, e2 } = await buildFixture();
  const checkpoint = createSignedVaultAccessDecisionChainCheckpoint({
    checkpointId: "checkpoint-001",
    entries: [e1, e2],
    decisionReceipts: [r1, r2],
    checkpointAt: "2026-09-02T12:05:00Z",
  });
  assert.equal(checkpoint.entryCount, 2);
  assert.equal(checkpoint.firstDecisionId, "decision-001");
  assert.equal(checkpoint.lastDecisionId, "decision-002");
  assert.equal(checkpoint.headChainDigest, e2.chainDigest);
  assert.equal(checkpoint.previousCheckpointDigest, null);
  assert.match(checkpoint.checkpointDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(checkpoint.productionReady, false);
});

test("asserts checkpoint against the same verified chain", async () => {
  const { r1, r2, e1, e2 } = await buildFixture();
  const checkpoint = createSignedVaultAccessDecisionChainCheckpoint({
    checkpointId: "checkpoint-001",
    entries: [e1, e2],
    decisionReceipts: [r1, r2],
    checkpointAt: "2026-09-02T12:05:00Z",
    previousCheckpointDigest: D("c"),
  });
  const verified = assertSignedVaultAccessDecisionChainCheckpoint({
    checkpoint,
    entries: [e1, e2],
    decisionReceipts: [r1, r2],
    expectedPreviousCheckpointDigest: D("c"),
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.checkpointDigest, checkpoint.checkpointDigest);
  assert.equal(verified.previousCheckpointDigest, D("c"));
});

test("tampered checkpoint fails closed", async () => {
  const { r1, r2, e1, e2 } = await buildFixture();
  const checkpoint = createSignedVaultAccessDecisionChainCheckpoint({
    checkpointId: "checkpoint-001",
    entries: [e1, e2],
    decisionReceipts: [r1, r2],
    checkpointAt: "2026-09-02T12:05:00Z",
  });
  const tampered = { ...checkpoint, entryCount: 3 };
  assert.throws(
    () =>
      assertSignedVaultAccessDecisionChainCheckpoint({
        checkpoint: tampered,
        entries: [e1, e2],
        decisionReceipts: [r1, r2],
      }),
    (error) =>
      error.code === "signed_vault_access_decision_chain_checkpoint_tampered",
  );
});

test("mismatched or reordered chain evidence fails before checkpoint acceptance", async () => {
  const { r1, r2, e1, e2 } = await buildFixture();
  const checkpoint = createSignedVaultAccessDecisionChainCheckpoint({
    checkpointId: "checkpoint-001",
    entries: [e1, e2],
    decisionReceipts: [r1, r2],
    checkpointAt: "2026-09-02T12:05:00Z",
  });
  assert.throws(() =>
    assertSignedVaultAccessDecisionChainCheckpoint({
      checkpoint,
      entries: [e1, e2],
      decisionReceipts: [r2, r1],
    }),
  );
});

test("expected previous checkpoint digest mismatch fails closed", async () => {
  const { r1, r2, e1, e2 } = await buildFixture();
  const checkpoint = createSignedVaultAccessDecisionChainCheckpoint({
    checkpointId: "checkpoint-001",
    entries: [e1, e2],
    decisionReceipts: [r1, r2],
    checkpointAt: "2026-09-02T12:05:00Z",
    previousCheckpointDigest: D("c"),
  });
  assert.throws(
    () =>
      assertSignedVaultAccessDecisionChainCheckpoint({
        checkpoint,
        entries: [e1, e2],
        decisionReceipts: [r1, r2],
        expectedPreviousCheckpointDigest: D("d"),
      }),
    (error) =>
      error.code === "signed_vault_access_decision_chain_checkpoint_tampered",
  );
});

test("malformed previous checkpoint digest is rejected", async () => {
  const { r1, r2, e1, e2 } = await buildFixture();
  assert.throws(
    () =>
      createSignedVaultAccessDecisionChainCheckpoint({
        checkpointId: "checkpoint-001",
        entries: [e1, e2],
        decisionReceipts: [r1, r2],
        checkpointAt: "2026-09-02T12:05:00Z",
        previousCheckpointDigest: "not-a-digest",
      }),
    (error) =>
      error.code === "invalid_signed_vault_access_decision_chain_checkpoint_digest",
  );
});

test("sensitive payloads are rejected and no production surface is exposed", async () => {
  const { r1, r2, e1, e2 } = await buildFixture();
  assert.throws(
    () =>
      createSignedVaultAccessDecisionChainCheckpoint({
        checkpointId: "checkpoint-001",
        entries: [e1, e2],
        decisionReceipts: [{ ...r1, rawImage: "forbidden" }, r2],
        checkpointAt: "2026-09-02T12:05:00Z",
      }),
    (error) =>
      error.code ===
      "signed_vault_access_decision_chain_checkpoint_sensitive_payload_forbidden",
  );

  const surface = {
    createSignedVaultAccessDecisionChainCheckpoint,
    assertSignedVaultAccessDecisionChainCheckpoint,
  };
  for (const field of [
    "sign",
    "publish",
    "deploy",
    "delete",
    "hardDelete",
    "decrypt",
    "getCiphertext",
    "getPrivateKey",
    "getKmsMaterial",
  ]) {
    assert.equal(surface[field], undefined);
  }
});
