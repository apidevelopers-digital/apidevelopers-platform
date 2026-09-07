import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_EXTERNAL_TRAINED_BACKBONE_ADMISSION_V1 as PROFILE,
  createExternalTrainedBackboneAdmissionV1 as create,
} from "../src/external-trained-backbone-admission-v1.mjs";

const digest = (char) => `sha256:${char.repeat(64)}`;

const base = (overrides = {}) => ({
  modelId: "candidate",
  modelFamily: "SFace/MobileFaceNet",
  artifactFormat: "onnx",
  sourceRepository: "https://github.com/opencv/opencv_zoo",
  sourcePath: "models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
  sourceRevision: "candidate-revision",
  weightsDigest: digest("a"),
  licenseSpdx: "Apache-2.0",
  licenseEvidenceRef: "opencv-zoo-sface-license",
  trainingDataProvenanceStatus: "unknown",
  commercialUseClarified: false,
  authenticationUseClarified: false,
  independentValidationStatus: "none",
  embeddingDim: 512,
  alignmentLandmarks: 5,
  sourceIntegrityVerified: true,
  ...overrides,
});

test("profile keeps 512D as the product requirement while admitting 128D in lab", () => {
  assert.deepEqual(PROFILE.supportedLabEmbeddingDims, [128, 512]);
  assert.equal(PROFILE.requiredProductEmbeddingDim, 512);
  assert.equal(PROFILE.productionReadyByDefault, false);
  assert.equal(PROFILE.biometricClaimReadyByDefault, false);
});

test("128D candidate can be lab eligible but not product eligible", () => {
  const receipt = create(base({ embeddingDim: 128 }));
  assert.equal(receipt.labInferenceEligible, true);
  assert.equal(receipt.embeddingDim, 128);
  assert.equal(receipt.requiredProductEmbeddingDim, 512);
  assert.equal(receipt.productEmbeddingDimCompatible, false);
  assert.equal(receipt.productUseEligible, false);
  assert.equal(receipt.productionReady, false);
});

test("512D candidate remains product-dimension compatible", () => {
  const receipt = create(base());
  assert.equal(receipt.productEmbeddingDimCompatible, true);
  assert.equal(receipt.productUseEligible, false);
});

test("unsupported dimension fails closed", () => {
  assert.throws(
    () => create(base({ embeddingDim: 256 })),
    (error) => error.code === "invalid_embedding_dim",
  );
});

test("fully clarified 512D model can become product-use eligible without production authorization", () => {
  const receipt = create(base({
    trainingDataProvenanceStatus: "documented",
    commercialUseClarified: true,
    authenticationUseClarified: true,
    independentValidationStatus: "verified",
    evaluationDigest: digest("b"),
  }));
  assert.equal(receipt.productUseEligible, true);
  assert.equal(receipt.productionAuthorized, false);
  assert.equal(receipt.productionReady, false);
  assert.equal(receipt.biometricClaimReady, false);
});

test("fully clarified 128D model still cannot become product-use eligible", () => {
  const receipt = create(base({
    embeddingDim: 128,
    trainingDataProvenanceStatus: "documented",
    commercialUseClarified: true,
    authenticationUseClarified: true,
    independentValidationStatus: "verified",
    evaluationDigest: digest("b"),
  }));
  assert.equal(receipt.productEmbeddingDimCompatible, false);
  assert.equal(receipt.productUseEligible, false);
});

test("source integrity gates lab inference", () => {
  const receipt = create(base({ sourceIntegrityVerified: false }));
  assert.equal(receipt.labInferenceEligible, false);
  assert.equal(receipt.productUseEligible, false);
});

test("unsupported license and malformed digest fail", () => {
  assert.throws(
    () => create(base({ licenseSpdx: "Proprietary" })),
    (error) => error.code === "unsupported_model_license",
  );
  assert.throws(
    () => create(base({ weightsDigest: "x" })),
    (error) => error.code === "invalid_admission_digest",
  );
});

test("admission digest is deterministic", () => {
  assert.equal(create(base()).admissionDigest, create(base()).admissionDigest);
});
