import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_AURAFACE_512D_CANDIDATE_V1 as CANDIDATE,
} from "../src/auraface-512d-candidate-v1.mjs";
import {
  createAuraFace512dNonBiometricRuntimeSmokePlanV1,
  validateAuraFace512dNonBiometricRuntimeSmokeReceiptV1,
} from "../src/auraface-512d-nonbiometric-runtime-smoke-v1.mjs";

const verifiedReceipt = () => ({
  version: "trust-face-auraface-512d-materialization-verification/v1",
  mode: "lab-candidate-only",
  modelId: CANDIDATE.modelId,
  sourceRevision: CANDIDATE.sourceRevision,
  artifactBytes: CANDIDATE.artifactBytes,
  artifactSha256: CANDIDATE.weightsDigest,
  sourceIntegrityVerified: true,
  labInferenceEligible: true,
  productEmbeddingDimCompatible: true,
  productUseEligible: false,
  benchmarkExecutionAuthorized: false,
  productionAuthorized: false,
  productionReady: false,
  biometricClaimReady: false,
});

const validRuntimeReceipt = (plan) => ({
  modelId: plan.modelId,
  sourceRevision: plan.sourceRevision,
  artifactSha256: plan.artifactSha256,
  preprocessingContractDigest: plan.preprocessingContractDigest,
  fixtureGenerator: plan.fixture.generator,
  fixtureGeneratorVersion: plan.fixture.generatorVersion,
  inputShape: [1, 3, 112, 112],
  inputDtype: "float32",
  outputShape: [1, 512],
  outputDtype: "float32",
  outputFinite: true,
  outputNonZero: true,
  downstreamL2NormalizationApplied: true,
  normalizedL2Norm: 1,
  biometricInputUsed: false,
  humanFaceInputUsed: false,
  faceDetectionExecuted: false,
  alignmentExecuted: false,
  embeddingPersisted: false,
  benchmarkExecuted: false,
  thresholdApplied: false,
  matchedClaimed: false,
  identityClaimed: false,
  calibrationMutationPerformed: false,
  controlledPilotAuthorized: false,
  productionAuthorized: false,
});

test("plans an AuraFace 512D runtime smoke without biometric input or execution", () => {
  const plan = createAuraFace512dNonBiometricRuntimeSmokePlanV1({
    materializationReceipt: verifiedReceipt(),
  });

  assert.equal(plan.fixture.biometricInput, false);
  assert.equal(plan.fixture.humanFaceInput, false);
  assert.equal(plan.fixture.persisted, false);
  assert.deepEqual(plan.expected.modelInputShape, [1, 3, 112, 112]);
  assert.deepEqual(plan.expected.modelOutputShape, [1, 512]);

  for (const key of [
    "biometricInputUsed",
    "faceDetectionExecuted",
    "alignmentExecuted",
    "inferenceAuthorized",
    "inferenceExecuted",
    "benchmarkAuthorized",
    "benchmarkExecuted",
    "thresholdApplied",
    "matchedClaimed",
    "identityClaimed",
    "calibrationMutationAllowed",
    "controlledPilotAuthorized",
    "productionAuthorized",
    "productionReady",
    "biometricClaimReady",
  ]) {
    assert.equal(plan[key], false, `${key} must remain false`);
  }
});

test("validates only a sanitized successful 512D runtime receipt", () => {
  const plan = createAuraFace512dNonBiometricRuntimeSmokePlanV1({
    materializationReceipt: verifiedReceipt(),
  });
  const receipt = validateAuraFace512dNonBiometricRuntimeSmokeReceiptV1({
    plan,
    receipt: validRuntimeReceipt(plan),
  });

  assert.deepEqual(receipt.outputShape, [1, 512]);
  assert.equal(receipt.outputFinite, true);
  assert.equal(receipt.outputNonZero, true);
  assert.equal(receipt.downstreamL2NormalizationApplied, true);
  assert.equal(receipt.normalizedL2Norm, 1);
  assert.equal(receipt.biometricInputUsed, false);
  assert.equal(receipt.embeddingPersisted, false);
  assert.equal(receipt.benchmarkExecuted, false);
  assert.equal(receipt.identityClaimed, false);
  assert.equal(receipt.productionReady, false);
});

test("fails closed if a receipt claims biometric input, identity, threshold or production", () => {
  const plan = createAuraFace512dNonBiometricRuntimeSmokePlanV1({
    materializationReceipt: verifiedReceipt(),
  });

  for (const patch of [
    { biometricInputUsed: true },
    { humanFaceInputUsed: true },
    { thresholdApplied: true },
    { identityClaimed: true },
    { productionAuthorized: true },
  ]) {
    assert.throws(
      () =>
        validateAuraFace512dNonBiometricRuntimeSmokeReceiptV1({
          plan,
          receipt: { ...validRuntimeReceipt(plan), ...patch },
        }),
      (error) => error?.code === "auraface_nonbiometric_smoke_receipt_drift",
    );
  }
});

test("fails closed on output dimension, non-finite/zero markers or missing L2", () => {
  const plan = createAuraFace512dNonBiometricRuntimeSmokePlanV1({
    materializationReceipt: verifiedReceipt(),
  });

  const cases = [
    [{ outputShape: [1, 128] }, "auraface_nonbiometric_smoke_output_shape_invalid"],
    [{ outputFinite: false }, "auraface_nonbiometric_smoke_output_invalid"],
    [{ outputNonZero: false }, "auraface_nonbiometric_smoke_output_invalid"],
    [{ downstreamL2NormalizationApplied: false }, "auraface_nonbiometric_smoke_l2_required"],
    [{ normalizedL2Norm: 0.7 }, "auraface_nonbiometric_smoke_l2_invalid"],
  ];

  for (const [patch, code] of cases) {
    assert.throws(
      () =>
        validateAuraFace512dNonBiometricRuntimeSmokeReceiptV1({
          plan,
          receipt: { ...validRuntimeReceipt(plan), ...patch },
        }),
      (error) => error?.code === code,
    );
  }
});
