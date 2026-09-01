import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_TEMPLATE_VAULT_ACCESS_AUTHORIZATION_V1 as PROFILE,
  TrustFaceTemplateVaultAccessAuthorizationV1Error,
  createTemplateVaultAccessAuthorization,
  assertTemplateVaultAccessAuthorization,
  createAuthorizedTemplateVaultReceiptAccess,
} from "../src/template-vault-access-authorization-v1.mjs";

const d = (c) => `sha256:${c.repeat(64)}`;

const receipt = (overrides = {}) => ({
  vaultReceiptId: "vault-receipt-001",
  receiptDigest: d("1"),
  enrollmentId: "enrollment-001",
  enrollmentManifestDigest: d("2"),
  consentLedgerDigest: d("3"),
  enrollmentAuthorizationDigest: d("4"),
  mode: "simulation-lab-only",
  metadataOnly: true,
  ...overrides,
});

const authInput = (overrides = {}) => ({
  authorizationId: "vault-access-auth-001",
  vaultReceipt: receipt(),
  purposeCode: "verification-orchestration",
  issuedAt: "2026-09-01T08:00:00Z",
  expiresAt: "2026-09-01T08:10:00Z",
  ...overrides,
});

const activeGate = (r = receipt()) => ({
  async getUsableReceipt(id) {
    return id === r.vaultReceiptId ? structuredClone(r) : null;
  },
});

test("profile is explicit simulation-only metadata access", () => {
  assert.equal(PROFILE.mode, "simulation-lab-only");
  assert.equal(PROFILE.authorizationObjectRequired, true);
  assert.equal(PROFILE.digestOnlyAccessAccepted, false);
  assert.equal(PROFILE.metadataOnlyAccessAuthorized, true);
  for (const field of [
    "biometricTemplateAccessAuthorized",
    "ciphertextAccessAuthorized",
    "keyMaterialAccessAuthorized",
    "kmsMaterialAccessAuthorized",
    "secretMaterialAccessAuthorized",
    "decryptionAuthorized",
    "templateDeletionAuthorized",
    "hardDeleteAuthorized",
    "realVaultAccessAuthorized",
    "realVaultReady",
    "productionReady",
    "biometricClaimReady",
  ]) {
    assert.equal(PROFILE[field], false);
  }
});

test("authorization canonically binds exact receipt and enrollment governance", () => {
  const a = createTemplateVaultAccessAuthorization(authInput());
  const b = createTemplateVaultAccessAuthorization(authInput());
  assert.deepEqual(a, b);
  assert.equal(a.scope, "face-template-vault-receipt-metadata-read");
  assert.equal(a.operation, "read-vault-receipt-metadata");
  assert.equal(a.vaultReceiptId, "vault-receipt-001");
  assert.equal(a.vaultReceiptDigest, d("1"));
  assert.equal(a.enrollmentId, "enrollment-001");
  assert.equal(a.enrollmentManifestDigest, d("2"));
  assert.equal(a.consentLedgerDigest, d("3"));
  assert.equal(a.originalEnrollmentAuthorizationDigest, d("4"));
  assert.match(a.authorizationDigest, /^sha256:[0-9a-f]{64}$/);
});

test("active full authorization validates", () => {
  const a = createTemplateVaultAccessAuthorization(authInput());
  const checked = assertTemplateVaultAccessAuthorization({
    authorization: a,
    vaultReceipt: receipt(),
    purposeCode: "verification-orchestration",
    now: "2026-09-01T08:05:00Z",
  });
  assert.equal(checked.authorized, true);
  assert.equal(checked.authorizationDigest, a.authorizationDigest);
});

test("digest-only authorization is rejected", () => {
  assert.throws(
    () =>
      assertTemplateVaultAccessAuthorization({
        authorization: d("9"),
        vaultReceipt: receipt(),
        purposeCode: "verification-orchestration",
        now: "2026-09-01T08:05:00Z",
      }),
    (error) =>
      error instanceof TrustFaceTemplateVaultAccessAuthorizationV1Error &&
      error.code === "template_vault_access_authorization_object_required",
  );
});

test("scope and operation tampering fail closed", () => {
  const a = createTemplateVaultAccessAuthorization(authInput());
  for (const tampered of [
    { ...a, scope: "face-template-vault-admin" },
    { ...a, operation: "decrypt-template" },
  ]) {
    assert.throws(() =>
      assertTemplateVaultAccessAuthorization({
        authorization: tampered,
        vaultReceipt: receipt(),
        purposeCode: "verification-orchestration",
        now: "2026-09-01T08:05:00Z",
      }),
    );
  }
});

test("receipt and governance binding mismatches fail closed", () => {
  const a = createTemplateVaultAccessAuthorization(authInput());
  for (const changedReceipt of [
    receipt({ receiptDigest: d("5") }),
    receipt({ enrollmentManifestDigest: d("6") }),
    receipt({ consentLedgerDigest: d("7") }),
    receipt({ enrollmentAuthorizationDigest: d("8") }),
  ]) {
    assert.throws(
      () =>
        assertTemplateVaultAccessAuthorization({
          authorization: a,
          vaultReceipt: changedReceipt,
          purposeCode: "verification-orchestration",
          now: "2026-09-01T08:05:00Z",
        }),
      (error) => error?.code === "template_vault_access_authorization_binding_mismatch",
    );
  }
});

test("purpose mismatch fails closed", () => {
  const a = createTemplateVaultAccessAuthorization(authInput());
  assert.throws(
    () =>
      assertTemplateVaultAccessAuthorization({
        authorization: a,
        vaultReceipt: receipt(),
        purposeCode: "security-review",
        now: "2026-09-01T08:05:00Z",
      }),
    (error) => error?.code === "template_vault_access_authorization_purpose_mismatch",
  );
});

test("future, expired and invalid authorization windows fail closed", () => {
  const a = createTemplateVaultAccessAuthorization(authInput());
  for (const now of ["2026-09-01T07:59:59Z", "2026-09-01T08:10:00Z"]) {
    assert.throws(
      () =>
        assertTemplateVaultAccessAuthorization({
          authorization: a,
          vaultReceipt: receipt(),
          purposeCode: "verification-orchestration",
          now,
        }),
      (error) => error?.code === "template_vault_access_authorization_not_active",
    );
  }

  assert.throws(
    () =>
      createTemplateVaultAccessAuthorization(
        authInput({
          issuedAt: "2026-09-01T08:10:00Z",
          expiresAt: "2026-09-01T08:10:00Z",
        }),
      ),
    (error) => error?.code === "invalid_template_vault_access_authorization_window",
  );
});

test("authorization digest and privileged policy tampering fail closed", () => {
  const a = createTemplateVaultAccessAuthorization(authInput());
  for (const tampered of [
    { ...a, authorizationDigest: d("9") },
    { ...a, biometricTemplateAccessAuthorized: true },
    { ...a, realVaultAccessAuthorized: true },
    { ...a, decryptionAuthorized: true },
  ]) {
    assert.throws(() =>
      assertTemplateVaultAccessAuthorization({
        authorization: tampered,
        vaultReceipt: receipt(),
        purposeCode: "verification-orchestration",
        now: "2026-09-01T08:05:00Z",
      }),
    );
  }
});

test("composed facade requires both non-revoked receipt and explicit authorization", async () => {
  const a = createTemplateVaultAccessAuthorization(authInput());
  const facade = createAuthorizedTemplateVaultReceiptAccess({
    revocationGate: activeGate(),
  });
  const result = await facade.getAuthorizedReceipt({
    vaultReceiptId: "vault-receipt-001",
    authorization: a,
    purposeCode: "verification-orchestration",
    now: "2026-09-01T08:05:00Z",
  });
  assert.equal(result.authorized, true);
  assert.equal(result.vaultReceipt.vaultReceiptId, "vault-receipt-001");

  await assert.rejects(
    () =>
      facade.getAuthorizedReceipt({
        vaultReceiptId: "vault-receipt-001",
        authorization: d("9"),
        purposeCode: "verification-orchestration",
        now: "2026-09-01T08:05:00Z",
      }),
    (error) => error?.code === "template_vault_access_authorization_object_required",
  );
});

test("revocation denial is preserved before authorization can grant access", async () => {
  let called = 0;
  const revoked = {
    async getUsableReceipt() {
      called += 1;
      const error = new Error("revoked");
      error.code = "template_vault_receipt_access_revoked";
      throw error;
    },
  };
  const facade = createAuthorizedTemplateVaultReceiptAccess({ revocationGate: revoked });
  const a = createTemplateVaultAccessAuthorization(authInput());

  await assert.rejects(
    () =>
      facade.getAuthorizedReceipt({
        vaultReceiptId: "vault-receipt-001",
        authorization: a,
        purposeCode: "verification-orchestration",
        now: "2026-09-01T08:05:00Z",
      }),
    (error) => error?.code === "template_vault_receipt_access_revoked";
  );
  assert.equal(called, 1);
});

test("facade exposes no broad listing, mutation, deletion, decryption or real-vault path", () => {
  const facade = createAuthorizedTemplateVaultReceiptAccess({
    revocationGate: activeGate(),
  });
  for (const field of [
    "list",
    "listAuthorizedReceipts",
    "create",
    "update",
    "delete",
    "hardDelete",
    "storeTemplate",
    "decrypt",
    "decryptTemplate",
    "deleteTemplate",
    "getCiphertext",
    "getKeyMaterial",
    "getKmsMaterial",
  ]) {
    assert.equal(facade[field], undefined);
  }
  assert.equal(facade.broadListingAuthorized, false);
  assert.equal(facade.realVaultAccessAuthorized, false);
  assert.equal(facade.productionReady, false);
});
