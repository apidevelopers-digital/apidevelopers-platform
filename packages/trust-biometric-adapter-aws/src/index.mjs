import {
  assertTrustBiometricAdapterManifest,
  assertTrustFaceLivenessRequest,
  normalizeTrustFaceLivenessResult,
} from "@apidevelopers/trust-biometric-adapter-contract";

const PROVIDER_ID = "aws.rekognition.face-liveness-comparefaces";
const MODE = "sandbox-conformance";
const REGION = "sa-east-1";
const AWS_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const AWS_CLIENT_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;
const OPAQUE_REF = /^ref:[A-Za-z0-9._:/-]{1,240}$/;

export class TrustAwsRekognitionAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustAwsRekognitionAdapterError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new TrustAwsRekognitionAdapterError(code, message);
}

function record(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_provider_result", `${field} must be an object`);
  }
  return value;
}

function text(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_provider_result", `${field} must be a non-empty string`);
  }
  return value.trim();
}

function opaqueRef(value, field) {
  const ref = text(value, field);
  if (!OPAQUE_REF.test(ref)) {
    fail("non_opaque_reference_forbidden", `${field} must be an opaque ref: reference`);
  }
  return ref;
}

function score100(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    fail("invalid_provider_score", `${field} must be between 0 and 100`);
  }
  return value / 100;
}

function threshold01(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    fail("invalid_sandbox_threshold", "sandboxLivenessThreshold must be between 0 and 1");
  }
  return value;
}

function assertNoRawLivenessMaterial(livenessResult) {
  const reference = livenessResult.ReferenceImage;
  if (reference && typeof reference === "object" && Object.hasOwn(reference, "Bytes")) {
    fail("raw_biometric_material_forbidden", "ReferenceImage.Bytes is forbidden at the Trust adapter boundary");
  }
  const auditImages = Array.isArray(livenessResult.AuditImages) ? livenessResult.AuditImages : [];
  if (auditImages.length > 0) {
    fail("audit_images_forbidden", "AuditImages must remain empty when AuditImagesLimit is 0");
  }
}

function assertS3ReferenceOnly(referenceImage) {
  const reference = record(referenceImage, "ReferenceImage");
  if (Object.hasOwn(reference, "Bytes")) {
    fail("raw_biometric_material_forbidden", "ReferenceImage.Bytes is forbidden at the Trust adapter boundary");
  }
  const s3 = record(reference.S3Object, "ReferenceImage.S3Object");
  text(s3.Bucket, "ReferenceImage.S3Object.Bucket");
  text(s3.Name, "ReferenceImage.S3Object.Name");
  if (s3.Version !== undefined) text(s3.Version, "ReferenceImage.S3Object.Version");
}

function topFaceSimilarity(compareFacesResult) {
  const value = record(compareFacesResult, "compareFacesResult");
  const matches = Array.isArray(value.FaceMatches) ? value.FaceMatches : [];
  if (matches.length === 0) {
    fail("provider_face_match_signal_missing", "CompareFaces must return a face similarity signal in sandbox conformance");
  }
  return Math.max(...matches.map((match, index) => {
    const item = record(match, `FaceMatches[${index}]`);
    return score100(item.Similarity, `FaceMatches[${index}].Similarity`);
  }));
}

export const AWS_REKOGNITION_SANDBOX_PROFILE = Object.freeze({
  providerId: PROVIDER_ID,
  mode: MODE,
  region: REGION,
  liveCallsEnabled: false,
  credentialsAllowed: false,
  productionEnabled: false,
  auditImagesLimit: 0,
  outputConfigRequired: true,
  compareFacesSimilarityThreshold: 0,
  compareFacesQualityFilter: "NONE",
  backendIamActions: Object.freeze([
    "rekognition:CreateFaceLivenessSession",
    "rekognition:GetFaceLivenessSessionResults",
    "rekognition:CompareFaces",
  ]),
  clientManagedOperation: "rekognition:StartFaceLivenessSession",
});

export function createAwsRekognitionSandboxManifest() {
  return assertTrustBiometricAdapterManifest({
    contractVersion: "trust-biometric-adapter/v1",
    providerId: PROVIDER_ID,
    mode: MODE,
    productionEnabled: false,
    capabilities: {
      faceVerification: true,
      liveness: true,
    },
    dataHandling: {
      rawBiometricPersistence: false,
      rawBiometricLogging: false,
      providerReference: true,
    },
  });
}

export function buildAwsRekognitionDryRunPlan({
  request,
  clientRequestToken,
  outputLocationRef,
  authorizedReferenceRef,
}) {
  const safeRequest = assertTrustFaceLivenessRequest(request);
  const token = text(clientRequestToken, "clientRequestToken");
  if (!AWS_CLIENT_TOKEN.test(token)) {
    fail("invalid_client_request_token", "clientRequestToken must match AWS idempotency token constraints");
  }

  const outputRef = opaqueRef(outputLocationRef, "outputLocationRef");
  const sourceRef = opaqueRef(authorizedReferenceRef, "authorizedReferenceRef");

  return Object.freeze({
    providerId: PROVIDER_ID,
    mode: MODE,
    region: REGION,
    liveCall: false,
    credentialsRequiredNow: false,
    canonicalRequest: safeRequest,
    operations: Object.freeze([
      Object.freeze({
        operation: "CreateFaceLivenessSession",
        execution: "template-only",
        inputTemplate: Object.freeze({
          ClientRequestToken: token,
          Settings: Object.freeze({
            AuditImagesLimit: 0,
            OutputConfigRef: outputRef,
          }),
        }),
      }),
      Object.freeze({
        operation: "StartFaceLivenessSession",
        execution: "client-managed-by-amplify",
        inputTemplate: Object.freeze({
          SessionIdRef: safeRequest.providerSessionRef,
        }),
      }),
      Object.freeze({
        operation: "GetFaceLivenessSessionResults",
        execution: "template-only",
        inputTemplate: Object.freeze({
          SessionIdRef: safeRequest.providerSessionRef,
        }),
      }),
      Object.freeze({
        operation: "CompareFaces",
        execution: "template-only",
        inputTemplate: Object.freeze({
          SourceImageRef: sourceRef,
          TargetImageRef: "ref:aws.liveness.reference-image",
          SimilarityThreshold: 0,
          QualityFilter: "NONE",
        }),
      }),
    ]),
    guardrails: Object.freeze({
      rawBiometricForwardingAllowed: false,
      rawBiometricPersistenceAllowed: false,
      auditImagesLimit: 0,
      providerThresholdCreatesDecision: false,
      productionAuthorized: false,
    }),
  });
}

export function normalizeAwsRekognitionSandboxSignals({
  livenessResult,
  compareFacesResult,
  sandboxLivenessThreshold = 0.9,
}) {
  const live = record(livenessResult, "livenessResult");
  const status = text(live.Status, "Status");

  if (!["CREATED", "IN_PROGRESS", "SUCCEEDED", "FAILED", "EXPIRED"].includes(status)) {
    fail("unknown_provider_status", `unsupported AWS liveness status: ${status}`);
  }
  if (status !== "SUCCEEDED") {
    fail("provider_session_not_successful", `AWS liveness session is not successful: ${status}`);
  }

  const sessionId = text(live.SessionId, "SessionId");
  if (!AWS_SESSION_ID.test(sessionId)) {
    fail("invalid_provider_session_id", "AWS SessionId must match the documented UUID shape");
  }

  assertNoRawLivenessMaterial(live);
  assertS3ReferenceOnly(live.ReferenceImage);

  const livenessScore = score100(live.Confidence, "Confidence");
  const faceMatchScore = topFaceSimilarity(compareFacesResult);
  const threshold = threshold01(sandboxLivenessThreshold);

  const manifest = createAwsRekognitionSandboxManifest();
  const normalized = normalizeTrustFaceLivenessResult({
    manifest,
    result: {
      status: "completed",
      providerReference: `aws.rekognition.liveness:${sessionId}`,
      faceMatchScore,
      livenessScore,
      livenessPassed: livenessScore >= threshold,
      reasonCodes: [
        "aws_liveness_succeeded",
        "aws_comparefaces_signal_only",
        livenessScore >= threshold
          ? "sandbox_liveness_threshold_met"
          : "sandbox_liveness_threshold_not_met",
      ],
    },
  });

  return Object.freeze({
    ...normalized,
    region: REGION,
    providerStatus: status,
    sandboxLivenessThreshold: threshold,
    decisionCreated: false,
    liveCallObserved: false,
    credentialsObserved: false,
  });
}
