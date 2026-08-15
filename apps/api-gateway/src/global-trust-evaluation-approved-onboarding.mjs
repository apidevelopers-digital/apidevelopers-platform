import { createTrustEvaluationCredentialEnvelopeHandoff } from "./global-trust-evaluation-credential-envelope.mjs";
import { createGlobalTrustEvaluationOperatorProvisioningService } from "./global-trust-evaluation-operator-provisioning.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    fail("TRUST_EVALUATION_APPROVED_ONBOARDING_INVALID_INPUT", `${name} is required`);
  }
  return normalized;
}

function requireService(value, methods, name) {
  if (!value || typeof value !== "object") {
    fail("TRUST_EVALUATION_APPROVED_ONBOARDING_INVALID_DEPENDENCY", `${name} is required`);
  }
  for (const method of methods) {
    if (typeof value[method] !== "function") {
      fail(
        "TRUST_EVALUATION_APPROVED_ONBOARDING_INVALID_DEPENDENCY",
        `${name}.${method} must be a function`,
      );
    }
  }
  return value;
}

export function createGlobalTrustEvaluationApprovedOnboardingService({
  evaluationTenantService,
  audit,
  recipientKeyEnrollmentService,
  deliverEnvelope,
} = {}) {
  const enrollments = requireService(
    recipientKeyEnrollmentService,
    ["getApprovedEnrollment"],
    "recipientKeyEnrollmentService",
  );
  if (typeof deliverEnvelope !== "function") {
    fail(
      "TRUST_EVALUATION_APPROVED_ONBOARDING_INVALID_DELIVERY_SINK",
      "deliverEnvelope must be a function",
    );
  }

  return Object.freeze({
    async provisionApprovedEvaluation({
      identity,
      organizationId: organizationIdInput,
      slug,
      displayName,
      ttlMs,
      limits,
      correlationId,
    } = {}) {
      const organizationId = requireText(organizationIdInput, "organizationId");
      const resolvedCorrelationId = requireText(correlationId, "correlationId");

      const enrollment = await enrollments.getApprovedEnrollment({
        identity,
        organizationId,
      });
      if (!enrollment) {
        fail(
          "TRUST_EVALUATION_APPROVED_ONBOARDING_ENROLLMENT_REQUIRED",
          "an approved recipient key enrollment is required before Evaluation provisioning",
        );
      }
      if (
        enrollment.status !== "approved"
        || enrollment.organizationId !== organizationId
        || enrollment.keyPossessionVerified !== true
        || enrollment.identityVerifiedByThisService !== false
      ) {
        fail(
          "TRUST_EVALUATION_APPROVED_ONBOARDING_ENROLLMENT_INVALID",
          "approved recipient key enrollment is not valid for Evaluation provisioning",
        );
      }

      const credentialHandoff = createTrustEvaluationCredentialEnvelopeHandoff({
        recipientPublicKey: enrollment.recipientPublicKeySpkiPem,
        deliverEnvelope: (envelope) =>
          deliverEnvelope(envelope, {
            organizationId,
            enrollmentId: enrollment.enrollmentId,
            recipientKeyFingerprint: enrollment.recipientKeyFingerprint,
          }),
      });
      if (credentialHandoff.recipientKeyFingerprint !== enrollment.recipientKeyFingerprint) {
        fail(
          "TRUST_EVALUATION_APPROVED_ONBOARDING_KEY_MISMATCH",
          "approved enrollment key fingerprint does not match sealed handoff key",
        );
      }

      const provisioning = createGlobalTrustEvaluationOperatorProvisioningService({
        evaluationTenantService,
        audit,
        credentialHandoff,
      });
      const receipt = await provisioning.provision({
        identity,
        organizationId,
        slug,
        displayName,
        ...(ttlMs === undefined ? {} : { ttlMs }),
        ...(limits === undefined ? {} : { limits }),
        correlationId: resolvedCorrelationId,
      });

      return Object.freeze({
        ...receipt,
        enrollmentId: enrollment.enrollmentId,
        recipientKeyFingerprint: enrollment.recipientKeyFingerprint,
        institutionalApprovalReference: enrollment.approvalReference,
        handoffMode: "sealed_envelope",
      });
    },
  });
}
