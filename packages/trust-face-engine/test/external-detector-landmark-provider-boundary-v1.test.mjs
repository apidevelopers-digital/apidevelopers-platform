import assert from "node:assert/strict";
import test from "node:test";
import { createConsentedRealEvaluationAuthorization } from "../src/consented-real-eval-auth-gate-v1.mjs";
import {
  TRUST_FACE_EXTERNAL_DETECTOR_LANDMARK_PROVIDER_BOUNDARY_V1 as PROFILE,
  createExternalDetectorLandmarkProviderBoundary,
} from "../src/external-detector-landmark-provider-boundary-v1.mjs";

const D = (char) => `sha256:${char.repeat(64)}`;

const authorization = (overrides = {}) =>
  createConsentedRealEvaluationAuthorization({
    authorizationId: "evaluation-auth-001",
    scope: "face-1to1-evaluation",
    protocolDigest: D("7"),
    codeCommit: "detector-code-abc123",
    issuedAt: "2026-09-02T15:00:00Z",
    expiresAt: "2026-09-02T17:00:00Z",
    evaluationOnly: true,
    trainingAuthorized: false,
    realBiometricEvaluationAuthorized: true,
    ...overrides,
  });

function validDetection() {
  return {
    facePresent: true,
    confidence: 0.93,
    boundingBox: { x: 0.2, y: 0.15, width: 0.6, height: 0.7 },
    landmarks: {
      leftEye: { x: 0.38, y: 0.38 },
      rightEye: { x: 0.62, y: 0.38 },
      nose: { x: 0.5, y: 0.53 },
      mouthLeft: { x: 0.42, y: 0.69 },
      mouthRight: { x: 0.58, y: 0.69 },
    },
  };
}

function provider(overrides = {}) {
  return {
    providerId: "detector-provider-001",
    providerVersion: "candidate-1",
    codeCommit: "detector-code-abc123",
    detectorModelDigest: D("1"),
    landmarkModelDigest: D("2"),
    evaluationDigest: D("3"),
    landmarkCount: 5,
    calls: 0,
    async detectByRef() {
      this.calls += 1;
      return validDetection();
    },
    ...overrides,
  };
}

test("profile is candidate-only and never claims production", () => {
  assert.equal(PROFILE.requiredLandmarkCount, 5);
  for (const field of [
    "rawBiometricPayloadAccepted", "binaryPayloadAccepted", "detectorResultStored",
    "providerAuthenticityVerified", "externalIndependentValidationVerified",
    "detectorProductionReady", "landmarkProductionReady", "productionReady", "biometricClaimReady",
  ]) assert.equal(PROFILE[field], false);
});

test("sensitive provider configuration fails before invocation", () => {
  const injected = provider({ privateKey: "forbidden" });
  assert.throws(
    () => createExternalDetectorLandmarkProviderBoundary({ provider: injected, protocolDigest: D("7") }),
    (error) => error.code === "external_detector_provider_sensitive_payload_forbidden",
  );
  assert.equal(injected.calls, 0);
});

test("wrong landmark count fails closed", () => {
  assert.throws(
    () => createExternalDetectorLandmarkProviderBoundary({ provider: provider({ landmarkCount: 68 }), protocolDigest: D("7") }),
    (error) => error.code === "external_detector_provider_landmark_count_mismatch",
  );
});

test("expired authorization fails before provider invocation", async () => {
  const injected = provider();
  const boundary = createExternalDetectorLandmarkProviderBoundary({ provider: injected, protocolDigest: D("7") });
  await assert.rejects(
    () => boundary.detectByRef({
      sampleRef: "sample://001",
      authorization: authorization({ expiresAt: "2026-09-02T15:30:00Z" }),
      now: "2026-09-02T16:00:00Z",
    }),
    (error) => error.code === "authorization_not_active",
  );
  assert.equal(injected.calls, 0);
});

test("authorized face-present result is normalized and remains non-production", async () => {
  const injected = provider();
  const boundary = createExternalDetectorLandmarkProviderBoundary({ provider: injected, protocolDigest: D("7") });
  const result = await boundary.detectByRef({
    sampleRef: "sample://001", authorization: authorization(), now: "2026-09-02T16:00:00Z",
  });
  assert.equal(injected.calls, 1);
  assert.equal(result.facePresent, true);
  assert.equal(result.landmarkCount, 5);
  assert.equal(result.landmarks.nose.x, 0.5);
  assert.equal(result.detectorResultStored, false);
  assert.equal(result.providerAuthenticityVerified, false);
  assert.equal(result.externalIndependentValidationVerified, false);
  assert.equal(result.productionReady, false);
});

test("face-absent result is accepted only without geometry", async () => {
  const injected = provider({
    async detectByRef() {
      this.calls += 1;
      return { facePresent: false, confidence: 0.88, boundingBox: null, landmarks: null };
    },
  });
  const boundary = createExternalDetectorLandmarkProviderBoundary({ provider: injected, protocolDigest: D("7") });
  const result = await boundary.detectByRef({ sampleRef: "sample://002", authorization: authorization(), now: "2026-09-02T16:00:00Z" });
  assert.equal(result.facePresent, false);
  assert.equal(result.boundingBox, null);
  assert.equal(result.landmarks, null);
  assert.equal(result.landmarkCount, 0);
});

test("invalid geometry and landmark escape fail closed", async () => {
  const badBox = createExternalDetectorLandmarkProviderBoundary({
    provider: provider({
      async detectByRef() {
        return { ...validDetection(), boundingBox: { x: 0.8, y: 0.2, width: 0.4, height: 0.5 } };
      },
    }),
    protocolDigest: D("7"),
  });
  await assert.rejects(
    () => badBox.detectByRef({ sampleRef: "sample://003", authorization: authorization(), now: "2026-09-02T16:00:00Z" }),
    (error) => error.code === "external_detector_provider_invalid_bounding_box",
  );

  const badLandmark = createExternalDetectorLandmarkProviderBoundary({
    provider: provider({
      async detectByRef() {
        const result = validDetection();
        result.landmarks.nose = { x: 0.95, y: 0.53 };
        return result;
      },
    }),
    protocolDigest: D("7"),
  });
  await assert.rejects(
    () => badLandmark.detectByRef({ sampleRef: "sample://004", authorization: authorization(), now: "2026-09-02T16:00:00Z" }),
    (error) => error.code === "external_detector_provider_landmark_outside_face_box",
  );
});

test("inline and raw biometric payloads are rejected before provider invocation", async () => {
  const injected = provider();
  const boundary = createExternalDetectorLandmarkProviderBoundary({ provider: injected, protocolDigest: D("7") });
  await assert.rejects(
    () => boundary.detectByRef({ sampleRef: "data:image/png;base64,abc", authorization: authorization(), now: "2026-09-02T16:00:00Z" }),
    (error) => error.code === "external_detector_provider_inline_payload_forbidden",
  );
  await assert.rejects(
    () => boundary.detectByRef({ sampleRef: "sample://005", authorization: { ...authorization(), rawImage: "forbidden" }, now: "2026-09-02T16:00:00Z" }),
    (error) => error.code === "external_detector_provider_sensitive_payload_forbidden",
  );
  assert.equal(injected.calls, 0);
});

test("boundary exposes no production management surface", () => {
  const boundary = createExternalDetectorLandmarkProviderBoundary({ provider: provider(), protocolDigest: D("7") });
  for (const field of ["deploy", "publish", "storePrivateKey", "getPrivateKey", "writeVault", "deleteTemplate", "loadModelWeights", "train"]) {
    assert.equal(boundary[field], undefined);
  }
});
