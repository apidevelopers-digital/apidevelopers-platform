import { createHash, createPublicKey } from "node:crypto";

export const TRUST_EVALUATION_RECIPIENT_KEY_ENROLLMENT_VERSION =
  "trust-evaluation-recipient-key-enrollment/v1";

const KEY_PROOF_COLLECTION = "trust.evaluation.recipient_key_challenges";
const ENROLLMENT_COLLECTION = "trust.evaluation.recipient_key_enrollments";
const EXPECTED_PROOF_VERSION = "trust-evaluation-recipient-key-proof/v1";
const EXPECTED_PROOF_ALGORITHM = "RSA-PSS-SHA256";
const APPROVAL_DECISION = "approved";
const APPROVAL_ASSERTION = "organization_and_recipient_authorized";

function fail(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  throw error;
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    fail("TRUST_EVALUATION_KEY_ENROLLMENT_INVALID_INPUT", `${name} is required`);
  }
  return normalized;
}

function requireIso(value, name) {
  const normalized = requireText(value, name);
  if (Number.isNaN(Date.parse(normalized))) {
    fail("TRUST_EVALUATION_KEY_ENROLLMENT_INVALID_TIME", `${name} must be an ISO-8601 date`);
  }
  return normalized;
}

function assertAdminIdentity(identity) {
  if (!identity || typeof identity !== "object") {
    fail("TRUST_EVALUATION_KEY_ENROLLMENT_UNAUTHORIZED", "operator identity is required");
  }
  const principal = identity.principal ?? {};
  const scopes = Array.isArray(principal.scopes) ? principal.scopes : [];
  if (
    identity.role !== "admin" ||
    principal.status !== "active" ||
    !String(principal.id ?? "").trim() ||
    !scopes.includes("admin:*")
  ) {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_FORBIDDEN",
      "active platform admin identity with admin:* is required",
    );
  }
  return Object.freeze({
    id: String(principal.id).trim(),
    name: String(principal.name ?? principal.id).trim(),
  });
}

function normalizePublicKey(recipientPublicKey) {
  if (
    (typeof recipientPublicKey === "string" && recipientPublicKey.includes("PRIVATE KEY")) ||
    recipientPublicKey?.type === "private"
  ) {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_PRIVATE_KEY_REJECTED",
      "recipientPublicKey must not contain private-key material",
    );
  }

  let key;
  try {
    key = createPublicKey(recipientPublicKey);
  } catch (cause) {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_INVALID_PUBLIC_KEY",
      "recipientPublicKey is invalid",
      cause,
    );
  }

  if (key.asymmetricKeyType !== "rsa") {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_UNSUPPORTED_PUBLIC_KEY",
      "recipientPublicKey must be RSA",
    );
  }

  const modulusLength = Number(key.asymmetricKeyDetails?.modulusLength ?? 0);
  if (!Number.isSafeInteger(modulusLength) || modulusLength < 2048) {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_WEAK_PUBLIC_KEY",
      "recipientPublicKey must use an RSA modulus of at least 2048 bits",
    );
  }

  const spkiDer = key.export({ type: "spki", format: "der" });
  const fingerprint = createHash("sha256").update(spkiDer).digest("base64url");
  const spkiPem = key.export({ type: "spki", format: "pem" }).toString();

  return Object.freeze({ fingerprint, spkiPem });
}

function normalizeApproval(approval, organizationId) {
  if (!approval || typeof approval !== "object") {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_APPROVAL_REQUIRED",
      "institutionalApproval is required",
    );
  }

  const decision = requireText(approval.decision, "institutionalApproval.decision");
  if (decision !== APPROVAL_DECISION) {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_NOT_APPROVED",
      "institutionalApproval.decision must be approved",
    );
  }

  const assertion = requireText(approval.assertion, "institutionalApproval.assertion");
  if (assertion !== APPROVAL_ASSERTION) {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_INVALID_APPROVAL_ASSERTION",
      `institutionalApproval.assertion must be ${APPROVAL_ASSERTION}`,
    );
  }

  const subjectOrganizationId = requireText(
    approval.subjectOrganizationId,
    "institutionalApproval.subjectOrganizationId",
  );
  if (subjectOrganizationId !== organizationId) {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_APPROVAL_SUBJECT_MISMATCH",
      "institutional approval does not match organizationId",
    );
  }

  return Object.freeze({
    decision,
    assertion,
    reference: requireText(approval.reference, "institutionalApproval.reference"),
    authority: requireText(approval.authority, "institutionalApproval.authority"),
    approvedBy: requireText(approval.approvedBy, "institutionalApproval.approvedBy"),
    approvedAt: requireIso(approval.approvedAt, "institutionalApproval.approvedAt"),
    subjectOrganizationId,
  });
}

function validatePersistedProof(record, { organizationId, fingerprint, challengeId }) {
  if (!record) {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_PROOF_NOT_FOUND",
      "recipient key proof challenge was not found",
    );
  }
  if (record.challengeId !== challengeId || record.status !== "consumed") {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_PROOF_NOT_CONSUMED",
      "recipient key proof must be successfully consumed",
    );
  }
  if (
    record.version !== EXPECTED_PROOF_VERSION ||
    record.algorithm !== EXPECTED_PROOF_ALGORITHM
  ) {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_PROOF_UNSUPPORTED",
      "recipient key proof version or algorithm is unsupported",
    );
  }
  if (record.organizationId !== organizationId) {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_PROOF_ORGANIZATION_MISMATCH",
      "recipient key proof does not match organizationId",
    );
  }
  if (record.recipientKeyFingerprint !== fingerprint) {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_PROOF_KEY_MISMATCH",
      "recipient key proof does not match recipient public key",
    );
  }
  if (
    record.verification?.keyPossessionVerified !== true ||
    record.verification?.identityVerified !== false ||
    !record.verification?.verifiedAt
  ) {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_PROOF_INVALID",
      "recipient key proof is not a valid possession-only verification",
    );
  }

  return Object.freeze({
    challengeId: record.challengeId,
    verifiedAt: requireIso(record.verification.verifiedAt, "proof.verification.verifiedAt"),
    correlationId: requireText(record.correlationId, "proof.correlationId"),
    keyPossessionVerified: true,
    identityVerified: false,
  });
}

function enrollmentIdFor(organizationId) {
  return createHash("sha256")
    .update(`trust-evaluation-recipient-key-enrollment:${organizationId}`, "utf8")
    .digest("base64url");
}

function publicReceipt(record, created) {
  return Object.freeze({
    created,
    enrollmentId: record.enrollmentId,
    version: record.version,
    status: record.status,
    organizationId: record.organizationId,
    recipientKeyFingerprint: record.recipientKeyFingerprint,
    keyPossessionVerified: true,
    institutionalApprovalRecorded: true,
    identityVerifiedByThisService: false,
    approvalReference: record.institutionalApproval.reference,
    approvedBy: record.institutionalApproval.approvedBy,
    approvedAt: record.institutionalApproval.approvedAt,
    recordedBy: record.recordedBy,
    recordedAt: record.recoredAt,
  });
}

export function createGlobalTrustEvaluationRecipientKeyEnrollmentService({
  store,
  clock = () => new Date().toISOString(),
} = {}) {
  if (
    !store ||
    typeof store.read !== "function" ||
    typeof store.transaction !== "function"
  ) {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_INVALID_STORE",
      "store must provide read and transaction",
    );
  }
  if (typeof clock !== "function") {
    fail(
      "TRUST_EVALUATION_KEY_ENROLLMENT_INVALID_CLOCK",
      "clock must be a function",
    );
  }

  return Object.freeze({
    async recordApprovedEnrollment({
      identity,
      organizationId: organizationIdInput,
      recipientPublicKey,
      keyProofChallengeId,
      institutionalApproval,
    } = {}) {
      const operator = assertAdminIdentity(identity);
      const organizationId = requireText(organizationIdInput, "organizationId");
      const challengeId = requireText(keyProofChallengeId, "keyProofChallengeId");
      const keyInfo = normalizePublicKey(recipientPublicKey);
      const approval = normalizeApproval(institutionalApproval, organizationId);
      const recordedAt = requireIso(clock(), "clock()");
      if (Date.parse(approval.approvedAt) > Date.parse(recordedAt)) {
        fail(
          "TRUST_EVALUATION_KEY_ENROLLMENT_APPROVAL_IN_FUTURE_",
          "institutional approval cannot be dated after the enrollment record",
        );
      }

      const state = await store.read();
      const proofRecord =
        state.collections?.[KEY_PROOF_COLLECTION]?.[challengeId] ?? null;
      const proof = validatePersistedProof(proofRecord, {
        organizationId,
        fingerprint: keyInfo.fingerprint,
        challengeId,
      });

      const enrollmentId = enrollmentIdFor(organizationId);
      const proposed = Object.freeze({
        enrollmentId,
        version: TRUST_EVALUATION_RECIPIENT_KEY_ENROLLMENT_VERSION,
        status: "approved",
        organizationId,
        recipientKeyFingerprint: keyInfo.fingerprint,
        recipientPublicKeySpkiPem: keyInfo.spkiPem,
        proof,
        institutionalApproval: approval,
        recordedBy: operator,
        recordedAt,
        identityVerification: Object.freeze({
          performedByThisService: false,
          source: "external_institutional_decision",
        }),
      });

      const committed = await store.transaction((tx) => {
        const current = tx.get(ENROLLMENT_COLLECTION, enrollmentId);
        if (current) {
          const same =
            current.status === "approved" &&
            current.organizationId === proposed.organizationId &&
            current.recipientKeyFingerprint === proposed.recipientKeyFingerprint &&
            current.proof?.challengeId === proposed.proof.challengeId &&
            current.institutionalApproval?.reference ===
              proposed.institutionalApproval.reference;

          if (same) {
            return Object.freeze({ created: false, record: current });
          }

          fail(
            "TRUST_EVALUATION_KEY_ENROLLMENT_CONFLICT",
            "organization already has a different recipient key enrollment; rotation or revocation is required",
          );
        }

        tx.put(ENROLLMENT_COLLECTION, enrollmentId, proposed, { ifAbsent: true });
        return Object.freeze({ created: true, record: proposed });
      });

      return publicReceipt(committed.result.record, committed.result.created);
    },

    async getApprovedEnrollment({
      identity,
      organizationId: organizationIdInput,
    } = {}) {
      assertAdminIdentity(identity);
      const organizationId = requireText(organizationIdInput, "organizationId");
      const enrollmentId = enrollmentIdFor(organizationId);
      const state = await store.read();
      const record =
        state.collections?.[ENROLLMENT_COLLECTION]?.[enrollmentId] ?? null;

      if (!record || record.status !== "approved") return null;

      return Object.freeze({
        enrollmentId: record.enrollmentId,
        version: record.version,
        status: record.status,
        organizationId: record.organizationId,
        recipientKeyFingerprint: record.recipientKeyFingerprint,
        recipientPublicKeySpkiPem: record.recipientPublicKeySpkiPem,
        approvalReference: record.institutionalApproval.reference,
        approvedBy: record.institutionalApproval.approvedBy,
        approvedAt: record.institutionalApproval.approvedAt,
        recordedBy: record.recordedBy,
        recordedAt: record.recordedAt,
        keyPossessionVerified: record.proof?.keyPossessionVerified === true,
        identityVerifiedByThisService: false,
      });
    },
  });
}
