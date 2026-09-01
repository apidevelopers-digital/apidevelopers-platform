import { createHash } from "node:crypto";

const POLICY = Object.freeze({
  version: "trust-face-template-vault-access-authorization/v1",
  scope: "face-template-vault-receipt-metadata-read",
  operation: "read-vault-receipt-metadata",
  mode: "simulation-lab-only",
  authorizationObjectRequired: true,
  digestOnlyAccessAccepted: false,
  metadataOnlyAccessAuthorized: true,
  biometricTemplateAccessAuthorized: false,
  ciphertextAccessAuthorized: false,
  keyMaterialAccessAuthorized: false,
  kmsMaterialAccessAuthorized: false,
  secretMaterialAccessAuthorized: false,
  decryptionAuthorized: false,
  templateDeletionAuthorized: false,
  hardDeleteAuthorized: false,
  realVaultAccessAuthorized: false,
  realVaultReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

export const TRUST_FACE_TEMPLATE_VAULT_ACCESS_AUTHORIZATION_V1 = POLICY;

const ALLOWED_PURPOSES = Object.freeze([
  "verification-orchestration",
  "subject-access",
  "security-review",
  "administrative-governance",
]);

export class TrustFaceTemplateVaultAccessAuthorizationV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceTemplateVaultAccessAuthorizationV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceTemplateVaultAccessAuthorizationV1Error(code, message);
};

const required = (value, field) => {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_template_vault_access_authorization_field", `${field} is required`);
  }
  return value.trim();
};

const sha256Digest = (value, field) => {
  const normalized = required(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    fail("invalid_template_vault_access_authorization_digest", `${field} must be sha256:<64 hex>`);
  }
  return normalized;
};

const iso = (value, field) => {
  const normalized = required(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) {
    fail("invalid_template_vault_access_authorization_time", `${field} must be ISO-8601`);
  }
  return Object.freeze({ iso: new Date(ms).toISOString(), ms });
};

const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const digestObject = (value) =>
  `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;

const object = (value, field) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_template_vault_access_authorization_object", `${field} must be an object`);
  }
  return value;
};

const purpose = (value) => {
  const normalized = required(value, "purposeCode");
  if (!ALLOWED_PURPOSES.includes(normalized)) {
    fail("invalid_template_vault_access_authorization_purpose", "purposeCode is not allowed");
  }
  return normalized;
};

const receiptBindings = (receipt) => {
  object(receipt, "vaultReceipt");
  return Object.freeze({
    vaultReceiptId: required(receipt.vaultReceiptId, "vaultReceipt.vaultReceiptId"),
    vaultReceiptDigest: sha256Digest(receipt.receiptDigest, "vaultReceipt.receiptDigest"),
    enrollmentId: required(receipt.enrollmentId, "vaultReceipt.enrollmentId"),
    enrollmentManifestDigest: sha256Digest(
      receipt.enrollmentManifestDigest,
      "vaultReceipt.enrollmentManifestDigest",
    ),
    consentLedgerDigest: sha256Digest(
      receipt.consentLedgerDigest,
      "vaultReceipt.consentLedgerDigest",
    ),
    originalEnrollmentAuthorizationDigest: sha256Digest(
      receipt.enrollmentAuthorizationDigest,
      "vaultReceipt.enrollmentAuthorizationDigest",
    ),
  });
};

const body = ({
  authorizationId,
  vaultReceipt,
  purposeCode,
  issuedAt,
  expiresAt,
}) => {
  const bindings = receiptBindings(vaultReceipt);
  return Object.freeze({
    version: POLICY.version,
    scope: POLICY.scope,
    operation: POLICY.operation,
    authorizationId,
    ...bindings,
    purposeCode,
    issuedAt,
    expiresAt,
    metadataOnlyAccessAuthorized: true,
    biometricTemplateAccessAuthorized: false,
    ciphertextAccessAuthorized: false,
    keyMaterialAccessAuthorized: false,
    kmsMaterialAccessAuthorized: false,
    secretMaterialAccessAuthorized: false,
    decryptionAuthorized: false,
    templateDeletionAuthorized: false,
    hardDeleteAuthorized: false,
    realVaultAccessAuthorized: false,
    realVaultReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
};

export function createTemplateVaultAccessAuthorization({
  authorizationId,
  vaultReceipt,
  purposeCode,
  issuedAt,
  expiresAt,
  accessAuthorized = true,
  metadataOnlyAccessAuthorized = true,
  biometricTemplateAccessAuthorized = false,
  ciphertextAccessAuthorized = false,
  keyMaterialAccessAuthorized = false,
  kmsMaterialAccessAuthorized = false,
  secretMaterialAccessAuthorized = false,
  decryptionAuthorized = false,
  templateDeletionAuthorized = false,
  hardDeleteAuthorized = false,
  realVaultAccessAuthorized = false,
} = {}) {
  if (accessAuthorized !== true) {
    fail("template_vault_access_not_authorized", "accessAuthorized must be true");
  }

  const policyInputs = {
    metadataOnlyAccessAuthorized,
    biometricTemplateAccessAuthorized,
    ciphertextAccessAuthorized,
    keyMaterialAccessAuthorized,
    kmsMaterialAccessAuthorized,
    secretMaterialAccessAuthorized,
    decryptionAuthorized,
    templateDeletionAuthorized,
    hardDeleteAuthorized,
    realVaultAccessAuthorized,
  };
  const expectedPolicy = {
    metadataOnlyAccessAuthorized: true,
    biometricTemplateAccessAuthorized: false,
    ciphertextAccessAuthorized: false,
    keyMaterialAccessAuthorized: false,
    kmsMaterialAccessAuthorized: false,
    secretMaterialAccessAuthorized: false,
    decryptionAuthorized: false,
    templateDeletionAuthorized: false,
    hardDeleteAuthorized: false,
    realVaultAccessAuthorized: false,
  };
  for (const [field, expected] of Object.entries(expectedPolicy)) {
    if (policyInputs[field] !== expected) {
      fail("template_vault_access_authorization_policy_forbidden", `${field} must be ${expected}`);
    }
  }

  const issued = iso(issuedAt, "issuedAt");
  const expires = iso(expiresAt, "expiresAt");
  if (expires.ms <= issued.ms) {
    fail("invalid_template_vault_access_authorization_window", "expiresAt must be after issuedAt");
  }

  const value = body({
    authorizationId: required(authorizationId, "authorizationId"),
    vaultReceipt,
    purposeCode: purpose(purposeCode),
    issuedAt: issued.iso,
    expiresAt: expires.iso,
  });

  return Object.freeze({
    ...value,
    accessAuthorized: true,
    authorizationObjectRequired: true,
    digestOnlyAccessAccepted: false,
    authorizationDigest: digestObject(value),
    mode: POLICY.mode,
  });
}

export function assertTemplateVaultAccessAuthorization({
  authorization,
  vaultReceipt,
  purposeCode,
  now,
} = {}) {
  if (!authorization || typeof authorization !== "object" || Array.isArray(authorization)) {
    fail(
      "template_vault_access_authorization_object_required",
      "full authorization object is required; digest-only access is forbidden",
    );
  }

  if (authorization.version !== POLICY.version) {
    fail("template_vault_access_authorization_version_mismatch", "authorization version mismatch");
  }
  if (authorization.scope !== POLICY.scope) {
    fail("template_vault_access_authorization_scope_mismatch", "authorization scope mismatch");
  }
  if (authorization.operation !== POLICY.operation) {
    fail("template_vault_access_authorization_operation_mismatch", "authorization operation mismatch");
  }
  if (authorization.accessAuthorized !== true) {
    fail("template_vault_access_not_authorized", "authorization is not active");
  }
  if (authorization.authorizationObjectRequired !== true || authorization.digestOnlyAccessAccepted !== false) {
    fail("template_vault_access_authorization_policy_mismatch", "authorization object/digest policy mismatch");
  }

  const policyFields = {
    metadataOnlyAccessAuthorized: true,
    biometricTemplateAccessAuthorized: false,
    ciphertextAccessAuthorized: false,
    keyMaterialAccessAuthorized: false,
    kmsMaterialAccessAuthorized: false,
    secretMaterialAccessAuthorized: false,
    decryptionAuthorized: false,
    templateDeletionAuthorized: false,
    hardDeleteAuthorized: false,
    realVaultAccessAuthorized: false,
    realVaultReady: false,
    productionReady: false,
    biometricClaimReady: false,
  };
  for (const [field, expected] of Object.entries(policyFields)) {
    if (authorization[field] !== expected) {
      fail("template_vault_access_authorization_policy_mismatch", `authorization ${field} mismatch`);
    }
  }

  const bindings = receiptBindings(vaultReceipt);
  const comparisons = {
    vaultReceiptId: bindings.vaultReceiptId,
    vaultReceiptDigest: bindings.vaultReceiptDigest,
    enrollmentId: bindings.enrollmentId,
    enrollmentManifestDigest: bindings.enrollmentManifestDigest,
    consentLedgerDigest: bindings.consentLedgerDigest,
    originalEnrollmentAuthorizationDigest: bindings.originalEnrollmentAuthorizationDigest,
  };
  for (const [field, expected] of Object.entries(comparisons)) {
    const actual = field.endsWith("Digest")
      ? sha256Digest(authorization[field], `authorization.${field}`)
      : required(authorization[field], `authorization.${field}`);
    if (actual !== expected) {
      fail("template_vault_access_authorization_binding_mismatch", `authorization ${field} mismatch`);
    }
  }

  const expectedPurpose = purpose(purposeCode);
  if (authorization.purposeCode !== expectedPurpose) {
    fail("template_vault_access_authorization_purpose_mismatch", "authorization purposeCode mismatch");
  }

  const current = iso(now, "now");
  const issued = iso(authorization.issuedAt, "authorization.issuedAt");
  const expires = iso(authorization.expiresAt, "authorization.expiresAt");
  if (expires.ms <= issued.ms) {
    fail("invalid_template_vault_access_authorization_window", "authorization window is invalid");
  }
  if (current.ms < issued.ms || current.ms >= expires.ms) {
    fail("template_vault_access_authorization_not_active", "authorization is outside its validity window");
  }

  const expectedBody = body({
    authorizationId: required(authorization.authorizationId, "authorization.authorizationId"),
    vaultReceipt,
    purposeCode: expectedPurpose,
    issuedAt: issued.iso,
    expiresAt: expires.iso,
  });
  const expectedDigest = digestObject(expectedBody);
  if (authorization.authorizationDigest !== expectedDigest) {
    fail("template_vault_access_authorization_digest_mismatch", "authorization digest mismatch");
  }

  return Object.freeze({
    authorized: true,
    authorizationId: expectedBody.authorizationId,
    authorizationDigest: expectedDigest,
    scope: POLICY.scope,
    operation: POLICY.operation,
    purposeCode: expectedPurpose,
    vaultReceiptId: bindings.vaultReceiptId,
    vaultReceiptDigest: bindings.vaultReceiptDigest,
    enrollmentId: bindings.enrollmentId,
    enrollmentManifestDigest: bindings.enrollmentManifestDigest,
    consentLedgerDigest: bindings.consentLedgerDigest,
    originalEnrollmentAuthorizationDigest: bindings.originalEnrollmentAuthorizationDigest,
    ...POLICY,
  });
}

export function createAuthorizedTemplateVaultReceiptAccess({ revocationGate } = {}) {
  if (!revocationGate || typeof revocationGate.getUsableReceipt !== "function") {
    fail(
      "invalid_template_vault_revocation_gate",
      "revocationGate must provide getUsableReceipt",
    );
  }

  return Object.freeze({
    version: "trust-face-authorized-template-vault-receipt-access/v1",
    authorizationObjectRequired: true,
    digestOnlyAccessAccepted: false,
    broadListingAuthorized: false,
    metadataOnlyAccessAuthorized: true,
    biometricTemplateAccessAuthorized: false,
    ciphertextAccessAuthorized: false,
    keyMaterialAccessAuthorized: false,
    kmsMaterialAccessAuthorized: false,
    secretMaterialAccessAuthorized: false,
    decryptionAuthorized: false,
    templateDeletionAuthorized: false,
    hardDeleteAuthorized: false,
    realVaultAccessAuthorized: false,
    realVaultReady: false,
    productionReady: false,
    biometricClaimReady: false,

    async getAuthorizedReceipt({
      vaultReceiptId,
      authorization,
      purposeCode,
      now,
    } = {}) {
      const id = required(vaultReceiptId, "vaultReceiptId");
      const receipt = await revocationGate.getUsableReceipt(id, { now });
      if (receipt === null) return null;

      const checked = assertTemplateVaultAccessAuthorization({
        authorization,
        vaultReceipt: receipt,
        purposeCode,
        now,
      });

      return Object.freeze({
        authorized: true,
        authorizationId: checked.authorizationId,
        authorizationDigest: checked.authorizationDigest,
        purposeCode: checked.purposeCode,
        vaultReceipt: receipt,
        metadataOnlyAccessAuthorized: true,
        biometricTemplateAccessAuthorized: false,
        ciphertextAccessAuthorized: false,
        keyMaterialAccessAuthorized: false,
        kmsMaterialAccessAuthorized: false,
        secretMaterialAccessAuthorized: false,
        decryptionAuthorized: false,
        templateDeletionAuthorized: false,
        hardDeleteAuthorized: false,
        realVaultAccessAuthorized: false,
        realVaultReady: false,
        productionReady: false,
        biometricClaimReady: false,
      });
    },
  });
}
