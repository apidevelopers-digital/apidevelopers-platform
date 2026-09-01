import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_TEMPLATE_VAULT_REVOCATION_GATE_V1 as PROFILE,
  TrustFaceTemplateVaultRevocationGateV1Error,
  createTemplateVaultRevocationGate,
} from "../src/template-vault-revocation-gate-v1.mjs";

const d = (c) => `sha256:${c.repeat(64)}`;

const receipt = (overrides = {}) => ({
  vaultReceiptId: "vault-receipt-001",
  receiptDigest: d("1"),
  enrollmentId: "enrollment-001",
  enrollmentManifestDigest: d("2"),
  envelopeMetadata: {
    envelopeRef: "opaque-envelope-ref:lab/001",
    keyRef: "opaque-key-ref:lab/001",
  },
  ...overrides,
});

const activeLifecycle = (overrides = {}) => ({
  enrollmentId: "enrollment-001",
  enrollmentManifestDigest: d("2"),
  state: "active",
  revocationDigest: null,
  revokedAt: null,
  reasonCode: null,
  revocationAuthorizationDigest: null,
  ...overrides,
});

const revokedLifecycle = (overrides = {}) => ({
  enrollmentId: "enrollment-001",
  enrollmentManifestDigest: d("2"),
  state: "revoked",
  revocationDigest: d("3"),
  revokedAt: "2026-09-01T06:00:00.000Z",
  reasonCode: "subject-request",
  revocationAuthorizationDigest: d("4"),
  ...overrides,
});

function persistence({ receipts = [receipt()], lifecycles = [activeLifecycle()] } = {}) {
  const receiptMap = new Map(receipts.map((r) => [r.vaultReceiptId, structuredClone(r)]));
  const lifecycleMap = new Map(lifecycles.map((l) => [l.enrollmentId, structuredClone(l)]));
  return {
    vaultReceiptPersistence: {
      async getReceipt(id) {
        return receiptMap.has(id) ? structuredClone(receiptMap.get(id)) : null;
      },
      async listReceipts({ enrollmentId = null } = {}) {
        return [...receiptMap.values()]
          .filter((r) => enrollmentId === null || r.enrollmentId === enrollmentId)
          .map((r) => structuredClone(r));
      },
    },
    enrollmentLifecyclePersistence: {
      async getEnrollmentLifecycle(id) {
        return lifecycleMap.has(id) ? structuredClone(lifecycleMap.get(id)) : null;
      },
    },
  };
}

test("profile is simulation-only and does not claim real vault enforcement", () => {
  assert.equal(PROFILE.mode, "simulation-lab-only");
  assert.equal(PROFILE.simulatedRevocationEnforced, true);
  assert.equal(PROFILE.realVaultRevocationEnforced, false);
  assert.equal(PROFILE.realVaultReady, false);
  assert.equal(PROFILE.encryptionPerformed, false);
  assert.equal(PROFILE.templateDeletionPerformed, false);
  assert.equal(PROFILE.productionReady, false);
  assert.equal(PROFILE.biometricClaimReady, false);
});

test("active enrollment allows metadata receipt access", async () => {
  const gate = createTemplateVaultRevocationGate(persistence());
  const decision = await gate.evaluateReceiptAccess("vault-receipt-001", {
    now: "2026-09-01T07:00:00Z",
  });
  assert.equal(decision.accessGranted, true);
  assert.equal(decision.reason, "enrollment_active");
  const usable = await gate.getUsableReceipt("vault-receipt-001", {
    now: "2026-09-01T07:00:00Z",
  });
  assert.equal(usable.vaultReceiptId, "vault-receipt-001");
});

test("revoked enrollment is denied fail-closed", async () => {
  const gate = createTemplateVaultRevocationGate(
    persistence({ lifecycles: [revokedLifecycle()] }),
  );
  const decision = await gate.evaluateReceiptAccess("vault-receipt-001", {
    now: "2026-09-01T07:00:00Z",
  });
  assert.equal(decision.accessGranted, false);
  assert.equal(decision.reason, "enrollment_revoked");
  assert.equal(decision.revocationDigest, d("3"));
  await assert.rejects(
    () =>
      gate.getUsableReceipt("vault-receipt-001", {
        now: "2026-09-01T07:00:00Z",
      }),
    (error) =>
      error instanceof TrustFaceTemplateVaultRevocationGateV1Error &&
      error.code === "template_vault_receipt_access_revoked",
  );
});

test("usable list excludes revoked receipt without deleting it", async () => {
  const r2 = receipt({
    vaultReceiptId: "vault-receipt-002",
    receiptDigest: d("5"),
    enrollmentId: "enrollment-002",
    enrollmentManifestDigest: d("6"),
  });
  const l2 = revokedLifecycle({
    enrollmentId: "enrollment-002",
    enrollmentManifestDigest: d("6"),
    revocationDigest: d("7"),
  });
  const gate = createTemplateVaultRevocationGate(
    persistence({ receipts: [receipt(), r2], lifecycles: [activeLifecycle(), l2] }),
  );
  const usable = await gate.listUsableReceipts({ now: "2026-09-01T07:00:00Z" });
  assert.deepEqual(usable.map((r) => r.vaultReceiptId), ["vault-receipt-001"]);
});

test("missing lifecycle fails closed", async () => {
  const gate = createTemplateVaultRevocationGate(persistence({ lifecycles: [] }));
  await assert.rejects(
    () => gate.getUsableReceipt("vault-receipt-001"),
    (error) => error?.code === "orphan_template_vault_receipt_lifecycle",
  );
});

test("manifest digest mismatch fails closed", async () => {
  const gate = createTemplateVaultRevocationGate(
    persistence({ lifecycles: [activeLifecycle({ enrollmentManifestDigest: d("9") })] }),
  );
  await assert.rejects(
    () => gate.evaluateReceiptAccess("vault-receipt-001"),
    (error) => error?.code === "template_vault_revocation_gate_manifest_digest_mismatch",
  );
});

test("unknown lifecycle state fails closed", async () => {
  const gate = createTemplateVaultRevocationGate(
    persistence({ lifecycles: [activeLifecycle({ state: "suspended" })] }),
  );
  await assert.rejects(
    () => gate.getUsableReceipt("vault-receipt-001"),
    (error) => error?.code === "template_vault_revocation_gate_invalid_lifecycle_state",
  );
});

test("active lifecycle carrying revocation evidence is rejected", async () => {
  const gate = createTemplateVaultRevocationGate(
    persistence({
      lifecycles: [
        activeLifecycle({
          revocationDigest: d("8"),
          revokedAt: "2026-09-01T06:00:00Z",
        }),
      ],
    }),
  );
  await assert.rejects(
    () => gate.evaluateReceiptAccess("vault-receipt-001"),
    (error) => error?.code === "template_vault_revocation_gate_active_state_tampered",
  );
});

test("future revocation evidence is rejected", async () => {
  const gate = createTemplateVaultRevocationGate(
    persistence({
      lifecycles: [
        revokedLifecycle({ revokedAt: "2026-09-02T06:00:00Z" }),
      ],
    }),
  );
  await assert.rejects(
    () =>
      gate.evaluateReceiptAccess("vault-receipt-001", {
        now: "2026-09-01T07:00:00Z",
      }),
    (error) => error?.code === "template_vault_revocation_gate_future_revocation",
  );
});

test("facade exposes no mutation, deletion, encryption or revocation-write path", () => {
  const gate = createTemplateVaultRevocationGate(persistence());
  for (const field of [
    "create",
    "update",
    "delete",
    "hardDelete",
    "storeTemplate",
    "encrypt",
    "revoke",
    "revokeEnrollment",
    "deleteTemplate",
  ]) {
    assert.equal(gate[field], undefined);
  }
  assert.equal(gate.realVaultRevocationEnforced, false);
  assert.equal(gate.hardDeleteAllowed, false);
});
