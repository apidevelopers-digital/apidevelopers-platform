import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_V1 as PROFILE,
  createTemplateVaultEnvelope,
  assertTemplateVaultEnvelope,
  createTemplateVaultPersistence,
} from "../src/template-vault-envelope-v1.mjs";

const d = (c) => `sha256:${c.repeat(64)}`;
const manifest = Object.freeze({
  enrollmentId: "enrollment-001",
  manifestDigest: d("1"),
  templateDigest: d("2"),
});

function input(overrides = {}) {
  return {
    vaultRecordId: "vault-record-001",
    enrollmentManifest: manifest,
    keyRef: "kms-sim://trust-face/key-001",
    keyVersion: "1",
    ciphertextDigest: d("3"),
    nonceDigest: d("4"),
    aadDigest: d("5"),
    createdAt: "2026-09-01T04:00:00Z",
    ...overrides,
  };
}

function repo() {
  const records = new Map();
  return {
    async create(record) {
      if (records.has(record.vaultRecordId)) {
        const error = new Error("conflict");
        error.code = "record_conflict";
        throw error;
      }
      records.set(record.vaultRecordId, structuredClone(record));
      return structuredClone(record);
    },
    async getById(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    unsafeMutate(id, mutate) {
      mutate(records.get(id));
    },
  };
}

test("profile is simulation-only and fail-closed", () => {
  assert.equal(PROFILE.storageMode, "simulation-metadata-only");
  assert.equal(PROFILE.plaintextTemplateAccepted, false);
  assert.equal(PROFILE.ciphertextPayloadAccepted, false);
  assert.equal(PROFILE.keyMaterialAccepted, false);
  assert.equal(PROFILE.kmsIntegrated, false);
  assert.equal(PROFILE.realTemplateStorageReady, false);
  assert.equal(PROFILE.productionReady, false);
});

test("envelope is deterministic and manifest-bound", () => {
  const a = createTemplateVaultEnvelope(input());
  const b = createTemplateVaultEnvelope(input());
  assert.deepEqual(a, b);
  assert.equal(a.enrollmentId, manifest.enrollmentId);
  assert.equal(a.enrollmentManifestDigest, manifest.manifestDigest);
  assert.equal(a.templateDigest, manifest.templateDigest);
  assert.match(a.envelopeDigest, /^sha256:[0-9a-f]{64}$/);
});

test("raw biometric, template, ciphertext and key material fields are forbidden", () => {
  for (const field of ["image", "embedding", "templatePayload", "plaintext", "ciphertext", "keyMaterial"]) {
    assert.throws(
      () => createTemplateVaultEnvelope(input({ [field]: "forbidden" })),
      (error) => error?.code === "vault_payload_forbidden",
    );
  }
});

test("only AES-256-GCM metadata profile is allowed", () => {
  assert.throws(
    () => createTemplateVaultEnvelope(input({ algorithm: "AES-128-GCM" })),
    (error) => error?.code === "vault_algorithm_not_allowed",
  );
});

test("assertion rejects envelope digest tampering", () => {
  const envelope = createTemplateVaultEnvelope(input());
  assert.throws(
    () => assertTemplateVaultEnvelope({
      envelope: { ...envelope, envelopeDigest: d("9") },
      enrollmentManifest: manifest,
      now: "2026-09-01T04:01:00Z",
    }),
    (error) => error?.code === "vault_envelope_digest_mismatch",
  );
});

test("assertion rejects manifest binding mismatch", () => {
  const envelope = createTemplateVaultEnvelope(input());
  const wrong = { ...manifest, manifestDigest: d("8") };
  assert.throws(
    () => assertTemplateVaultEnvelope({
      envelope,
      enrollmentManifest: wrong,
      now: "2026-09-01T04:01:00Z",
    }),
    (error) => ["vault_manifest_digest_mismatch", "vault_envelope_digest_mismatch"].includes(error?.code),
  );
});

test("persistence stores and reads metadata without decrypt or delete APIs", async () => {
  const repository = repo();
  const vault = createTemplateVaultPersistence({ repository });
  const stored = await vault.storeEnvelope(input());
  const loaded = await vault.getEnvelope(stored.vaultRecordId, {
    enrollmentManifest: manifest,
    now: "2026-09-01T04:01:00Z",
  });
  assert.deepEqual(loaded, stored);
  assert.equal(vault.decryptAvailable, false);
  assert.equal(vault.unwrapKeyAvailable, false);
  assert.equal(vault.hardDeleteAvailable, false);
  assert.equal("decrypt" in vault, false);
  assert.equal("delete" in vault, false);
});

test("tampered persisted metadata fails closed on read", async () => {
  const repository = repo();
  const vault = createTemplateVaultPersistence({ repository });
  const stored = await vault.storeEnvelope(input());
  repository.unsafeMutate(stored.vaultRecordId, (record) => {
    record.ciphertextDigest = d("7");
  });
  await assert.rejects(
    () => vault.getEnvelope(stored.vaultRecordId, {
      enrollmentManifest: manifest,
      now: "2026-09-01T04:01:00Z",
    }),
    (error) => error?.code === "vault_envelope_digest_mismatch",
  );
});

test("duplicate vault record id propagates repository conflict", async () => {
  const vault = createTemplateVaultPersistence({ repository: repo() });
  await vault.storeEnvelope(input());
  await assert.rejects(
    () => vault.storeEnvelope(input()),
    (error) => error?.code === "record_conflict",
  );
});
