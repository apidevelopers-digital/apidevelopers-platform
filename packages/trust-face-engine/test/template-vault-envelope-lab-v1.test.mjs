
import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_TEMPLATE_VAULT_ENVELOPE_LAB_V1 as PROFILE,
  TrustFaceTemplateVaultEnvelopeLabV1Error,
  createTemplateVaultEnvelopeLabRecord,
  assertTemplateVaultEnvelopeLabRecord,
  createTemplateVaultEnvelopeLabPersistence,
} from "../src/template-vault-envelope-lab-v1.mjs";

const d = (c) => `sha256:${c.repeat(64)}`;
const manifest = Object.freeze({
  enrollmentId: "enrollment-001",
  subjectRef: "subject-001",
  templateRef: "vault://trust-face/templates/template-001",
  templateDigest: d("1"),
  modelVersion: "trust-face-owned-embedding/v1",
  consentLedgerDigest: d("2"),
  authorizationDigest: d("3"),
  enrolledAt: "2026-09-01T03:00:00Z",
  manifestDigest: d("4"),
});
const input = (overrides = {}) => ({
  enrollmentManifest: manifest,
  vaultRef: "lab-vault://trust-face/enrollment-001",
  sealedObjectDigest: d("5"),
  wrappedDataKeyDigest: d("6"),
  nonceDigest: d("7"),
  keyAlias: "lab-key-alias://trust-face/template-v1",
  createdAt: "2026-09-01T03:30:00Z",
  ...overrides,
});
function repo(initial = []) {
  const map = new Map(initial.map((record) => [record.enrollmentId, structuredClone(record)]));
  return {
    async create(record) {
      if (map.has(record.enrollmentId)) { const e = new Error("conflict"); e.code = "record_conflict"; throw e; }
      map.set(record.enrollmentId, structuredClone(record));
      return structuredClone(record);
    },
    async getById(id) { return map.has(id) ? structuredClone(map.get(id)) : null; },
    async list() { return [...map.values()].map((v) => structuredClone(v)); },
    unsafeMutate(id, mutate) { mutate(map.get(id)); },
  };
}

test("profile is synthetic metadata-only and non-production", () => {
  assert.equal(PROFILE.syntheticOnly, true);
  assert.equal(PROFILE.metadataOnly, true);
  assert.equal(PROFILE.ciphertextPayloadPersisted, false);
  assert.equal(PROFILE.plaintextTemplateAllowed, false);
  assert.equal(PROFILE.rawBiometricsAllowed, false);
  assert.equal(PROFILE.rawEmbeddingsAllowed, false);
  assert.equal(PROFILE.keyMaterialPersisted, false);
  assert.equal(PROFILE.keyProviderReady, false);
  assert.equal(PROFILE.encryptionPerformed, false);
  assert.equal(PROFILE.hardDeleteAllowed, false);
  assert.equal(PROFILE.rotationSupported, false);
  assert.equal(PROFILE.realTemplateStorageReady, false);
  assert.equal(PROFILE.productionReady, false);
});

test("record is deterministic and bound to enrollment manifest", () => {
  const a = createTemplateVaultEnvelopeLabRecord(input());
  const b = createTemplateVaultEnvelopeLabRecord(input());
  assert.deepEqual(a, b);
  assert.equal(a.enrolmentId, manifest.enrollmentId);
  assert.equal(a.enrolmentManifestDigest, manifest.manifestDigest);
  assert.equal(a.templateDigest, manifest.templateDigest);
  assert.match(a.recordDigest, /^sha256:[0-9a-f]{64}$/);
});

test("raw payloads, ciphertext and key material are rejected", () => {
  for (const field of ["image","video","embedding","vector","template","plaintext","ciphertext","wrappedDataKey","dataKey","keyMaterial"]) {
    assert.throws(
      () => createTemplateVaultEnvelopeLabRecord({ ...input(), [field]: "forbidden" }),
      (e) => e instanceof TrustFaceTemplateVaultEnvelopeLabV1Error && e.code === "template_vault_payload_forbidden",
    );
  }
});

test("assertion validates record and rejects future createdAt", () => {
  const record = createTemplateVaultEnvelopeLabRecord(input());
  const checked = assertTemplateVaultEnvelopeLabRecord({ record, enrollmentManifest: manifest, now: "2026-09-01T03:40:00Z" });
  assert.equal(checked.valid, true);
  assert.throws(
    () => assertTemplateVaultEnvelopeLabRecord({ record, enrollmentManifest: manifest, now: "2026-09-01T03:29:59Z" }),
    (e) => e?.code === "template_vault_record_from_future",
   );
});

test("tampering with policy or digest is rejected", () => {
  const record = createTemplateVaultEnvelopeLabRecord(input());
  assert.throws(
    () => assertTemplateVaultEnvelopeLabRecord({ record: { ...record, encryptionPerformed: true }, enrollmentManifest: manifest, now: "2026-09-01T03:40:00Z" }),
    (e) => e?.code === "template_vault_policy_mismatch",
  );
  assert.throws(
    () => assertTemplateVaultEnvelopeLabRecord({ record: { ...record, recordDigest: d("9") }, enrollmentManifest: manifest, now: "2026-09-01T03:40:00Z" }),
    (e) => e?.code === "template_vault_record_digest_mismatch",
   );
});

test("tampering with manifest binding is rejected", () => {
  const record = createTemplateVaultEnvelopeLabRecord(input());
  assert.throws(
    () => assertTemplateVaultEnvelopeLabRecord({ record, enrollmentManifest: { ...manifest, manifestDigest: d("8") }, now: "2026-09-01T03:40:00Z" }),
    (e) => e?.code === "template_vault_enrollmentManifestDigest_mismatch",
  );
});

test("persistence facade registers reads and lists verified records", async () => {
  const enrollmentRepository = repo([manifest]);
  const repository = repo();
  const persistence = createTemplateVaultEnvelopeLabPersistence({ repository, enrollmentRepository });
  const created = await persistence.register({
    enrollmentId: manifest.enrollmentId,
    vaultRef: "lab-vault://trust-face/enrollment-001",
    sealedObjectDigest: d("5"),
    wrappedDataKeyDigest: d("6"),
    nonceDigest: d("7"),
    keyAlias: "lab-key-alias://trust-face/template-v1",
    createdAt: "2026-09-01T03:30:00Z",
  });
  assert.deepEqual(await persistence.get(manifest.enrollmentId, { now: "2026-09-01T03:40:00Z" }), created);
  assert.deepEqual(await persistence.list({ now: "2026-09-01T03:40:00Z" }), [created]);
  assert.equal("delete" in persistence, false);
  assert.equal("replace" in persistence, false);
  assert.equal("rotate" in persistence, false);
});

test("persistence fails closed for tampered and orphan records", async () => {
  const enrollmentRepository = repo([manifest]);
  const repository = repo();
  const persistence = createTemplateVaultEnvelopeLabPersistence({ repository, enrollmentRepository });
  const created = await persistence.register({
    enrollmentId: manifest.enrollmentId,
    vaultRef: "lab-vault://trust-face/enrollment-001",
    sealedObjectDigest: d("5"),
    wrappedDataKeyDigest: d("6"),
    nonceDigest: d("7"),
    keyAlias: "lab-key-alias://trust-face/template-v1",
    createdAt: "2026-09-01T03:30:00Z",
  });
  repository.unsafeMutate(manifest.enrollmentId, (record) => { record.keyProviderReady = true; });
  await assert.rejects(
    () => persistence.get(manifest.enrollmentId, { now: "2026-09-01T03:40:00Z" }),
    (e) => e?.code === "template_vault_policy_mismatch",
  );
  const orphanPersistence = createTemplateVaultEnvelopeLabPersistence({
    repository: repo([{ ...created, enrollmentId: "enrollment-orphan" }]),
    enrollmentRepository,
  });
  await assert.rejects(
    () => orphanPersistence.list({ now: "2026-09-01T03:40:00Z" }),
    (e) => e?.code === "template_vault_orphan_record",
  );
});
