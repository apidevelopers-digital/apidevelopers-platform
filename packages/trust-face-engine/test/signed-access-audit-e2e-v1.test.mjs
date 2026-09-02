import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { createSignedGovernedTemplateVaultFlow } from "../src/signed-governed-template-vault-flow-v1.mjs";
import { createSignedVaultAccessDecisionAudit } from "../src/signed-vault-access-decision-receipt-v1.mjs";
import { createSignedVaultAccessDecisionChainEntry, verifySignedVaultAccessDecisionChain } from "../src/signed-vault-access-decision-chain-v1.mjs";
import { createSignedVaultAccessDecisionChainCheckpoint, assertSignedVaultAccessDecisionChainCheckpoint } from "../src/signed-vault-access-decision-chain-checkpoint-v1.mjs";

const d = (c) => `sha256:${c.repeat(64)}`;

function repository(idField) {
  const records = new Map();
  return {
    async create(value) {
      const id = value[idField];
      if (records.has(id)) {
        const error = new Error("record conflict");
        error.code = "record_conflict";
        throw error;
      }
      records.set(id, structuredClone(value));
      return structuredClone(value);
    },
    async getById(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async list({ where = {} } = {}) {
      return [...records.values()]
        .filter((value) => Object.entries(where).every(([key, expected]) => value[key] === expected))
        .map((value) => structuredClone(value));
    },
  };
}

function createFlow() {
  return createSignedGovernedTemplateVaultFlow({
    enrollmentRepository: repository("enrollmentId"),
    revocationRepository: repository("enrollmentId"),
    receiptRepository: repository("vaultReceiptId"),
    trustedKeyRepository: repository("keyId"),
    trustedKeyRevocationRepository: repository("keyId"),
  });
}

async function prepare(flow) {
  const manifest = await flow.enroll({
    enrollmentId: "enrollment-001",
    subjectRef: "subject-ref-001",
    templateRef: "vault://trust-face/templates/template-001",
    templateDigest: d("1"),
    modelVersion: "trust-face-owned-embedding/v1",
    consentLedgerDigest: d("2"),
    authorizationDigest: d("3"),
    enrolledAt: "2026-09-02T14:00:00Z",
  });
  const receipt = await flow.recordVaultReceipt({
    enrollmentId: manifest.enrollmentId,
    vaultReceiptId: "vault-receipt-001",
    envelopeMetadata: {
      envelopeRef: "opaque-envelope-ref:trust-face/lab/envelope-001",
      keyRef: "opaque-key-ref:trust-face/lab/key-001",
      encryptionAlgorithm: "AES-256-GCM",
      createdAt: "2026-09-02T14:01:00Z",
    },
    auditDigest: d("4"),
    recordedAt: "2026-09-02T14:02:00Z",
  });
  const authorization = await flow.createLabAccessAuthorization({
    vaultReceiptId: receipt.vaultReceiptId,
    authorizationId: "vault-access-auth-001",
    purposeCode: "verification-orchestration",
    issuedAt: "2026-09-02T14:03:00Z",
    expiresAt: "2026-09-02T14:30:00Z",
  });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  await flow.registerLabTrustedPublicKey({
    keyId: "lab-key-001",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    validFrom: "2026-09-02T14:00:00Z",
    validUntil: "2026-09-02T15:00:00Z",
    registeredAt: "2026-09-02T14:01:30Z",
    registrationEvidenceDigest: d("5"),
  });
  const proof = {
    keyId: "lab-key-001",
    algorithm: "Ed25519",
    signedMessage: "authorizationDigest",
    authorizationDigest: authorization.authorizationDigest,
    signature: sign(null, Buffer.from(authorization.authorizationDigest), privateKey).toString("base64"),
  };
  return { receipt, authorization, proof };
}

test("E2E audit path records allow, then key-revoked deny, and verifies chain checkpoints", async () => {
  const flow = createFlow();
  const { receipt, authorization, proof } = await prepare(flow);
  const audit = createSignedVaultAccessDecisionAudit({
    signedFlow: flow,
    decisionRepository: repository("decisionId"),
  });

  const allow = await audit.evaluateAndRecord({
    decisionId: "decision-001",
    vaultReceiptId: receipt.vaultReceiptId,
    authorization,
    proof,
    purposeCode: "verification-orchestration",
    now: "2026-09-02T14:04:00Z",
  });
  assert.equal(allow.allowed, true);

  const e1 = createSignedVaultAccessDecisionChainEntry({
    sequence: 1,
    decisionReceipt: allow.decisionReceipt,
    appendedAt: "2026-09-02T14:04:30Z",
  });
  const c1 = createSignedVaultAccessDecisionChainCheckpoint({
    checkpointId: "checkpoint-001",
    entries: [e1],
    decisionReceipts: [allow.decisionReceipt],
    checkpointAt: "2026-09-02T14:05:00Z",
  });

  await flow.revokeLabTrustedPublicKey({
    keyId: "lab-key-001",
    reasonCode: "key-compromise",
    revokedAt: "2026-09-02T14:06:00Z",
    revocationEvidenceDigest: d("6"),
  });

  const deny = await audit.evaluateAndRecord({
    decisionId: "decision-002",
    vaultReceiptId: receipt.vaultReceiptId,
    authorization,
    proof,
    purposeCode: "verification-orchestration",
    now: "2026-09-02T14:07:00Z",
  });
  assert.equal(deny.allowed, false);
  assert.equal(deny.access, null);
  assert.equal(deny.decisionReceipt.decision, "deny");
  assert.equal(deny.decisionReceipt.reasonCode, "template_vault_access_trust_registry_key_revoked");

  const e2 = createSignedVaultAccessDecisionChainEntry({
    sequence: 2,
    decisionReceipt: deny.decisionReceipt,
    previousChainDigest: e1.chainDigest,
    appendedAt: "2026-09-02T14:07:30Z",
  });
  const chain = verifySignedVaultAccessDecisionChain({
    entries: [e1, e2],
    decisionReceipts: [allow.decisionReceipt, deny.decisionReceipt],
  });
  assert.equal(chain.valid, true);
  assert.equal(chain.headChainDigest, e2.chainDigest);

  const c2 = createSignedVaultAccessDecisionChainCheckpoint({
    checkpointId: "checkpoint-002",
    entries: [e1, e2],
    decisionReceipts: [allow.decisionReceipt, deny.decisionReceipt],
    checkpointAt: "2026-09-02T14:08:00Z",
    previousCheckpointDigest: c1.checkpointDigest,
  });
  const verified = assertSignedVaultAccessDecisionChainCheckpoint({
    checkpoint: c2,
    entries: [e1, e2],
    decisionReceipts: [allow.decisionReceipt, deny.decisionReceipt],
    expectedPreviousCheckpointDigest: c1.checkpointDigest,
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.entryCount, 2);
  assert.equal(verified.previousCheckpointDigest, c1.checkpointDigest);
  assert.equal(verified.productionReady, false);
});

test("composed audit path remains lab-only and exposes no production secret/vault surface", () => {
  const flow = createFlow();
  const audit = createSignedVaultAccessDecisionAudit({
    signedFlow: flow,
    decisionRepository: repository("decisionId"),
  });
  assert.equal(flow.productionReady, false);
  assert.equal(flow.realVaultAccessAuthorized, false);
  assert.equal(flow.signingPerformed, false);
  assert.equal(flow.privateKeyAccepted, false);
  assert.equal(audit.productionReady, false);
  assert.equal(audit.realVaultAccessAuthorized, false);
  for (const field of ["signAuthorization", "storePrivateKey", "getPrivateKey", "decrypt", "getCiphertext", "getKmsMaterial", "publish", "deploy", "hardDelete"]) {
    assert.equal(flow[field], undefined);
    assert.equal(audit[field], undefined);
  }
});
