import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  TRUST_FACE_TEMPLATE_VAULT_LAB_V1 as PROFILE,
  createTemplateVaultLabEnvelope,
  assertTemplateVaultLabEnvelope,
  decryptTemplateVaultLabEnvelope,
  createTemplateVaultLabPersistence,
} from "./template-vault-lab-v1.mjs";

const key = Buffer.alloc(32, 7);
const payload = Buffer.from("synthetic-template-fixture:subject-001");
const digest = `sha256:${createHash("sha256").update(payload).digest("hex")}`;

function input(overrides = {}) {
  return {
    templateRef: "vault://trust-face/templates/template-001",
    templateDigest: digest,
    modelVersion: "trust-face-owned-embedding/v1",
    keyRef: "kms-lab://trust-face/key-001",
    key,
    payload,
    nonce: Buffer.alloc(12, 9),
    createdAt: "2026-09-01T05:00:00Z",
    ...overrides,
  };
}

function repo() {
  const map = new Map();
  return {
    async create(record) {
      if (map.has(record.id)) { const e = new Error("conflict"); e.code = "record_conflict"; throw e; }
      map.set(record.id, structuredClone(record));
      return structuredClone(record);
    },
    async getById(id) { return map.has(id) ? structuredClone(map.get(id)) : null; },
    async list() { return [...map.values()].map((value) => structuredClone(value)); },
    unsafeMutate(id, fn) { fn(map.get(id)); },
  };
}

test("profile is lab-only and non-production", () => {
  assert.equal(PROFILE.keyMaterialPersisted, false);
  assert.equal(PROFILE.rawBiometricPayloadAccepted, false);
  assert.equal(PROFILE.realTemplateAccepted, false);
  assert.equal(PROFILE.productionKmsReady, false);
  assert.equal(PROFILE.productionReady, false);
});

test("envelope encryption is deterministic with fixed nonce and decrypts", () => {
  const a = createTemplateVaultLabEnvelope(input());
  const b = createTemplateVaultLabEnvelope(input());
  assert.deepEqual(a, b);
  assert.equal("key" in a, false);
  assert.equal(a.keyMaterialPersisted, false);
  assert.deepEqual(decryptTemplateVaultLabEnvelope({ envelope: a, key, now: "2026-09-01T05:01:00Z" }), payload);
});

test("real or unclassified template payloads are rejected", () => {
  assert.throws(
    () => createTemplateVaultLabEnvelope(input({ payloadClass: "real-biometric-template" })),
    (e) => e?.code === "real_template_payload_forbidden",
  );
});

test("template digest must bind the synthetic payload", () => {
  assert.throws(
    () => createTemplateVaultLabEnvelope(input({ templateDigest: `sha256:${"0".repeat(64)}` })),
    (e) => e?.code === "template_digest_mismatch",
  );
});

test("tampering with ciphertext or policy is rejected", () => {
  const envelope = createTemplateVaultLabEnvelope(input());
  const tamperedCiphertext = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -1)}A` };
  assert.throws(
    () => decryptTemplateVaultLabEnvelope({ envelope: tamperedCiphertext, key, now: "2026-09-01T05:01:00Z" }),
    (e) => e?.code === "vault_envelope_authentication_failed",
  );
  assert.throws(
    () => assertTemplateVaultLabEnvelope({ envelope: { ...envelope, productionReady: true } }),
    (e) => e?.code === "vault_envelope_policy_mismatch",
  );
});

test("wrong key fails authenticated decryption", () => {
  const envelope = createTemplateVaultLabEnvelope(input());
  assert.throws(
    () => decryptTemplateVaultLabEnvelope({ envelope, key: Buffer.alloc(32, 8) }),
    (e) => e?.code === "vault_envelope_authentication_failed",
  );
});

test("AAD metadata tampering is rejected", () => {
  const envelope = createTemplateVaultLabEnvelope(input());
  assert.throws(
    () => assertTemplateVaultLabEnvelope({ envelope: { ...envelope, keyRef: "kms-lab://other-key" } }),
    (e) => e?.code === "vault_envelope_aad_digest_mismatch",
  );
});

test("persistence stores envelope only and revalidates on read/list", async () => {
  const repository = repo();
  const persistence = createTemplateVaultLabPersistence({ repository });
  const stored = await persistence.storeTemplate(input());
  assert.equal("key" in stored, false);
  assert.equal(stored.keyMaterialPersisted, false);
  const loaded = await persistence.getTemplateEnvelope(stored.templateRef, { now: "2026-09-01T05:01:00Z" });
  assert.equal(loaded.templateDigest, digest);
  const listed = await persistence.listTemplateEnvelopes({ now: "2026-09-01T05:01:00Z" });
  assert.equal(listed.length, 1);
  assert.equal(persistence.hardDeleteAllowed, false);
  assert.equal(persistence.cryptoErasurePerformed, false);
});

test("tampered persisted envelope fails closed on read", async () => {
  const repository = repo();
  const persistence = createTemplateVaultLabPersistence({ repository });
  const stored = await persistence.storeTemplate(input());
  repository.unsafeMutate(stored.templateRef, (record) => { record.productionReady = true; });
  await assert.rejects(
    () => persistence.getTemplateEnvelope(stored.templateRef, { now: "2026-09-01T05:01:00Z" }),
    (e) => e?.code === "vault_envelope_policy_mismatch",
  );
});
