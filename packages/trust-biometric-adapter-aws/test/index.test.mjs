import test from "node:test";
import assert from "node:assert/strict";
import {
  AWS_REKOGNITION_SANDBOX_PROFILE,
  TrustAwsRekognitionAdapterError,
  buildAwsRekognitionDryRunPlan,
  createAwsRekognitionSandboxManifest,
  normalizeAwsRekognitionSandboxSignals,
} from "../src/index.mjs";

const request = (overrides = {}) => ({
  environment: "sandbox",
  tenantId: "tenant.sandbox.alpha",
  verificationId: "verification.sandbox.001",
  subjectRef: "subject.sha256.0123456789abcdef",
  providerSessionRef: "provider-session.ref.001",
  consentRef: "consent.ref.001",
  ...overrides,
});

const livenessResult = (overrides = {}) => ({
  SessionId: "0f959dbb-37cc-45d8-a08d-dc42cce85fa8",
  Status: "SUCCEEDED",
  Confidence: 98.5,
  ReferenceImage: {
    S3Object: {
      Bucket: "sandbox-reference-bucket",
      Name: "trust/m4/reference.jpg",
    },
    BoundingBox: {
      Height: 0.4,
      Left: 0.2,
      Top: 0.2,
      Width: 0.4,
    },
  },
  AuditImages: [],
  ...overrides,
});

const compareFacesResult = (overrides = {}) => ({
  FaceMatches: [
    {
      Similarity: 94.2,
      Face: {
        Confidence: 99.9,
      },
    },
  ],
  UnmatchedFaces: [],
  ...overrides,
});

test("pins AWS sandbox profile to non-production Sao Paulo with zero audit images", () => {
  assert.equal(AWS_REKOGNITION_SANDBOX_PROFILE.region, "sa-east-1");
  assert.equal(AWS_REKOGNITION_SANDBOX_PROFILE.liveCallsEnabled, false);
  assert.equal(AWS_REKOGNITION_SANDBOX_PROFILE.credentialsAllowed, false);
  assert.equal(AWS_REKOGNITION_SANDBOX_PROFILE.productionEnabled, false);
  assert.equal(AWS_REKOGNITION_SANDBOX_PROFILE.auditImagesLimit, 0);
  assert.equal(AWS_REKOGNITION_SANDBOX_PROFILE.compareFacesSimilarityThreshold, 0);
});

test("creates a provider-specific manifest that still conforms to the Trust neutral contract", () => {
  const manifest = createAwsRekognitionSandboxManifest();
  assert.equal(manifest.providerId, "aws.rekognition.face-liveness-comparefaces");
  assert.equal(manifest.mode, "sandbox-conformance");
  assert.equal(manifest.productionEnabled, false);
});

test("builds a dry-run only AWS operation plan using opaque references", () => {
  const plan = buildAwsRekognitionDryRunPlan({
    request: request(),
    clientRequestToken: "trust-m4-sandbox-001",
    outputLocationRef: "ref:aws.sandbox.output-config",
    authorizedReferenceRef: "ref:trust.authorized-reference.001",
  });

  assert.equal(plan.liveCall, false);
  assert.equal(plan.credentialsRequiredNow, false);
  assert.deepEqual(
    plan.operations.map((operation) => operation.operation),
    [
      "CreateFaceLivenessSession",
      "StartFaceLivenessSession",
      "GetFaceLivenessSessionResults",
      "CompareFaces",
    ],
  );
  assert.equal(plan.operations[0].inputTemplate.Settings.AuditImagesLimit, 0);
  assert.equal(plan.operations[3].inputTemplate.SimilarityThreshold, 0);
  assert.equal(plan.operations[3].inputTemplate.QualityFilter, "NONE");
});

test("rejects direct S3 locations because real provider resources are not authorized yet", () => {
  assert.throws(
    () =>
      buildAwsRekognitionDryRunPlan({
        request: request(),
        clientRequestToken: "trust-m4-sandbox-001",
        outputLocationRef: "s3://real-bucket/output",
        authorizedReferenceRef: "ref:trust.authorized-reference.001",
      }),
    (error) =>
      error instanceof TrustAwsRekognitionAdapterError &&
      error.code === "non_opaque_reference_forbidden",
  );
});

test("inherits the generic production fail-closed gate", () => {
  assert.throws(
    () =>
      buildAwsRekognitionDryRunPlan({
        request: request({ environment: "production" }),
        clientRequestToken: "trust-m4-sandbox-001",
        outputLocationRef: "ref:aws.sandbox.output-config",
        authorizedReferenceRef: "ref:trust.authorized-reference.001",
      }),
    (error) => error.code === "production_not_authorized",
  );
});

test("normalizes AWS liveness and face comparison scores as signals only", () => {
  const normalized = normalizeAwsRekognitionSandboxSignals({
    livenessResult: livenessResult(),
    compareFacesResult: compareFacesResult(),
    sandboxLivenessThreshold: 0.9,
  });

  assert.equal(normalized.signals.livenessScore, 0.985);
  assert.equal(normalized.signals.faceMatchScore, 0.942);
  assert.equal(normalized.signals.livenessPassed, true);
  assert.equal(normalized.productionAuthorized, false);
  assert.equal(normalized.rawBiometricMaterialForwarded, false);
  assert.equal(normalized.rawBiometricMaterialPersisted, false);
  assert.equal(normalized.decisionCreated, false);
  assert.equal(normalized.liveCallObserved, false);
  assert.equal(Object.hasOwn(normalized, "decision"), false);
});

test("keeps sandbox threshold behavior separate from a governed decision", () => {
  const normalized = normalizeAwsRekognitionSandboxSignals({
    livenessResult: livenessResult({ Confidence: 72 }),
    compareFacesResult: compareFacesResult(),
    sandboxLivenessThreshold: 0.9,
  });

  assert.equal(normalized.signals.livenessScore, 0.72);
  assert.equal(normalized.signals.livenessPassed, false);
  assert.equal(normalized.decisionCreated, false);
});

test("rejects raw reference bytes from AWS", () => {
  assert.throws(
    () =>
      normalizeAwsRekognitionSandboxSignals({
        livenessResult: livenessResult({
          ReferenceImage: { Bytes: Buffer.from("forbidden") },
        }),
        compareFacesResult: compareFacesResult(),
      }),
    (error) =>
      error instanceof TrustAwsRekognitionAdapterError &&
      error.code === "raw_biometric_material_forbidden",
  );
});

test("rejects audit images even when the provider response contains references only", () => {
  assert.throws(
    () =>
      normalizeAwsRekognitionSandboxSignals({
        livenessResult: livenessResult({
          AuditImages: [
            {
              S3Object: {
                Bucket: "sandbox-reference-bucket",
                Name: "trust/m4/audit.jpg",
              },
            },
          ],
        }),
        compareFacesResult: compareFacesResult(),
      }),
    (error) =>
      error instanceof TrustAwsRekognitionAdapterError &&
      error.code === "audit_images_forbidden",
  );
});

test("fails closed on non-successful provider sessions", () => {
  assert.throws(
    () =>
      normalizeAwsRekognitionSandboxSignals({
        livenessResult: livenessResult({ Status: "EXPIRED" }),
        compareFacesResult: compareFacesResult(),
      }),
    (error) =>
      error instanceof TrustAwsRekognitionAdapterError &&
      error.code === "provider_session_not_successful",
  );
});

test("fails closed when CompareFaces does not return a similarity signal", () => {
  assert.throws(
    () =>
      normalizeAwsRekognitionSandboxSignals({
        livenessResult: livenessResult(),
        compareFacesResult: compareFacesResult({ FaceMatches: [] }),
      }),
    (error) =>
      error instanceof TrustAwsRekognitionAdapterError &&
      error.code === "provider_face_match_signal_missing",
  );
});
