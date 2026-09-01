const POLICY = Object.freeze({
  version: "trust-face-template-vault-revocation-gate/v1",
  purpose: "deny-simulated-template-vault-receipt-use-after-governed-enrollment-revocation",
  mode: "simulation-lab-only",
  metadataOnly: true,
  logicalAccessGate: true,
  simulatedRevocationEnforced: true,
  realVaultRevocationEnforced: false,
  realVaultReady: false,
  encryptionPerformed: false,
  templateDeletionPerformed: false,
  hardDeleteAllowed: false,
  rawBiometricsRetained: false,
  rawEmbeddingsRetained: false,
  rawBiometricPayloadAccepted: false,
  rawEmbeddingAccepted: false,
  productionReady: false,
  biometricClaimReady: false,
});

export const TRUST_FACE_TEMPLATE_VAULT_REVOCATION_GATE_V1 = POLICY;

export class TrustFaceTemplateVaultRevocationGateV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceTemplateVaultRevocationGateV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceTemplateVaultRevocationGateV1Error(code, message);
};

const text = (value, field) => {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_template_vault_revocation_gate_field", `${field} is required`);
  }
  return value.trim();
};

const digest = (value, field) => {
  const normalized = text(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    fail("invalid_template_vault_revocation_gate_digest", `${field} must be sha256:<64 hex>`);
  }
  return normalized;
};

const iso = (value, field) => {
  const normalized = text(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) {
    fail("invalid_template_vault_revocation_gate_time", `${field} must be ISO-8601`);
  }
  return new Date(ms).toISOString();
};

const ensureObject = (value, field) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_template_vault_revocation_gate_object", `${field} must be an object`);
  }
  return value;
};

function assertReceipt(receipt) {
  ensureObject(receipt, "receipt");
  return Object.freeze({
    vaultReceiptId: text(receipt.vaultReceiptId, "receipt.vaultReceiptId"),
    receiptDigest: digest(receipt.receiptDigest, "receipt.receiptDigest"),
    enrollmentId: text(receipt.enrollmentId, "receipt.enrollmentId"),
    enrollmentManifestDigest: digest(receipt.enrollmentManifestDigest, "receipt.enrollmentManifestDigest"),
  });
}

function assertLifecycle(lifecycle, receipt, now = null) {
  ensureObject(lifecycle, "lifecycle");
  const enrollmentId = text(lifecycle.enrollmentId, "lifecycle.enrollmentId");
  const enrollmentManifestDigest = digest(
    lifecycle.enrollmentManifestDigest,
    "lifecycle.enrollmentManifestDigest",
  );

  if (enrollmentId !== receipt.enrollmentId) {
    fail(
      "template_vault_revocation_gate_enrollment_mismatch",
      "lifecycle enrollmentId does not match receipt",
    );
  }
  if (enrollmentManifestDigest !== receipt.enrollmentManifestDigest) {
    fail(
      "template_vault_revocation_gate_manifest_digest_mismatch",
      "lifecycle enrollment manifest digest does not match receipt",
    );
  }

  if (lifecycle.state !== "active" && lifecycle.state !== "revoked") {
    fail(
      "template_vault_revocation_gate_invalid_lifecycle_state",
      "lifecycle state must be active or revoked",
    );
  }

  if (lifecycle.state === "active") {
    if (
      lifecycle.revocationDigest !== null ||
      lifecycle.revokedAt !== null ||
      lifecycle.reasonCode !== null ||
      lifecycle.revocationAuthorizationDigest !== null
    ) {
      fail(
        "template_vault_revocation_gate_active_state_tampered",
        "active lifecycle must not contain revocation evidence",
      );
    }
    return Object.freeze({
      enrollmentId,
      enrollmentManifestDigest,
      state: "active",
      revocationDigest: null,
      revokedAt: null,
      reasonCode: null,
      revocationAuthorizationDigest: null,
    });
  }

  const revokedAt = iso(lifecycle.revokedAt, "lifecycle.revokedAt");
  if (now !== null && Date.parse(revokedAt) > Date.parse(iso(now, "now"))) {
    fail(
      "template_vault_revocation_gate_future_revocation",
      "revokedAt cannot be after now",
    );
  }

  return Object.freeze({
    enrollmentId,
    enrollmentManifestDigest,
    state: "revoked",
    revocationDigest: digest(lifecycle.revocationDigest, "lifecycle.revocationDigest"),
    revokedAt,
    reasonCode: text(lifecycle.reasonCode, "lifecycle.reasonCode"),
    revocationAuthorizationDigest: digest(
      lifecycle.revocationAuthorizationDigest,
      "lifecycle.revocationAuthorizationDigest",
    ),
  });
}

function decisionFrom(receipt, lifecycle) {
  const denied = lifecycle.state === "revoked";
  return Object.freeze({
    version: POLICY.version,
    vaultReceiptId: receipt.vaultReceiptId,
    receiptDigest: receipt.receiptDigest,
    enrollmentId: receipt.enrollmentId,
    enrollmentManifestDigest: receipt.enrollmentManifestDigest,
    accessGranted: !denied,
    decision: denied ? "deny" : "allow",
    reason: denied ? "enrollment_revoked" : "enrollment_active",
    lifecycleState: lifecycle.state,
    revocationDigest: lifecycle.revocationDigest,
    revokedAt: lifecycle.revokedAt,
    revocationAuthorizationDigest: lifecycle.revocationAuthorizationDigest,
    ...POLICY,
  });
}

export function createTemplateVaultRevocationGate({
  vaultReceiptPersistence,
  enrollmentLifecyclePersistence,
} = {}) {
  if (
    !vaultReceiptPersistence ||
    typeof vaultReceiptPersistence.getReceipt !== "function" ||
    typeof vaultReceiptPersistence.listReceipts !== "function"
  ) {
    fail(
      "invalid_template_vault_receipt_persistence",
      "vaultReceiptPersistence must provide getReceipt and listReceipts",
    );
  }
  if (
    !enrollmentLifecyclePersistence ||
    typeof enrollmentLifecyclePersistence.getEnrollmentLifecycle !== "function"
  ) {
    fail(
      "invalid_enrollment_lifecycle_persistence",
      "enrollmentLifecyclePersistence must provide getEnrollmentLifecycle",
    );
  }

  const load = async (vaultReceiptId, now = null) => {
    const id = text(vaultReceiptId, "vaultReceiptId");
    const rawReceipt = await vaultReceiptPersistence.getReceipt(id, { now });
    if (rawReceipt === null) return null;

    const receipt = assertReceipt(rawReceipt);
    const rawLifecycle = await enrollmentLifecyclePersistence.getEnrollmentLifecycle(
      receipt.enrollmentId,
      { now },
    );
    if (rawLifecycle === null) {
      fail(
        "orphan_template_vault_receipt_lifecycle",
        "receipt references a missing enrollment lifecycle",
      );
    }
    const lifecycle = assertLifecycle(rawLifecycle, receipt, now);
    return Object.freeze({ rawReceipt, receipt, lifecycle });
  };

  return Object.freeze({
    ...POLICY,

    async evaluateReceiptAccess(vaultReceiptId, { now = null } = {}) {
      const loaded = await load(vaultReceiptId, now);
      return loaded === null ? null : decisionFrom(loaded.receipt, loaded.lifecycle);
    },

    async getUsableReceipt(vaultReceiptId, { now = null } = {}) {
      const loaded = await load(vaultReceiptId, now);
      if (loaded === null) return null;
      if (loaded.lifecycle.state === "revoked") {
        fail(
          "template_vault_receipt_access_revoked",
          "template vault receipt access is denied because enrollment is revoked",
        );
      }
      return loaded.rawReceipt;
    },

    async listUsableReceipts({ enrollmentId = null, now = null } = {}) {
      const records = await vaultReceiptPersistence.listReceipts({ enrollmentId, now });
      if (!Array.isArray(records)) {
        fail(
          "invalid_template_vault_receipt_list",
          "vaultReceiptPersistence.listReceipts must return an array",
        );
      }

      const out = [];
      for (const rawReceipt of records) {
        const receipt = assertReceipt(rawReceipt);
        const rawLifecycle = await enrollmentLifecyclePersistence.getEnrollmentLifecycle(
          receipt.enrollmentId,
          { now },
        );
        if (rawLifecycle === null) {
          fail(
            "orphan_template_vault_receipt_lifecycle",
            "receipt references a missing enrollment lifecycle",
          );
        }
        const lifecycle = assertLifecycle(rawLifecycle, receipt, now);
        if (lifecycle.state === "active") out.push(rawReceipt);
      }
      return Object.freeze([...out]);
    },
  });
}
