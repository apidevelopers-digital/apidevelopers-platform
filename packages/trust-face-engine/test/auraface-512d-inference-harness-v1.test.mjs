import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_AURAFACE_512D_CANDIDATE_V1 as CANDIDATE,
} from "../src/auraface-512d-candidate-v1.mjs";
import {
  TRUST_FACE_AURAFACE_512D_PREPROCESSING_CONTRACT_V1 as PREPROCESSING,
} from "../src/auraface-512d-preprocessing-contract-v1.mjs";
import {
  TRUST_FACE_AURAFACE_512D_INFERENCE_HARNESS_V1,
  createAuraFace512dInferenceHarnessV1,
  prepareAuraFace512dSampleInferencePlanV1,
} from "../src/auraface-512d-inference-harness-v1.mjs";

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

test("prepares AuraFace 512D harness with execution disabled and exact pinned contract", () => {
  const harness = createAuraFace512dInferenceHarnessV1({
    materializationReceipt: verifiedReceipt(),
  });

  assert.equal(
    harness.version,
    TRUST_FACE_AURAFACE_512D_INFERENCE_HARNESS_V1.version,
  );
  assert.equal(harness.embeddingDim, 512);
  assert.equal(harness.sourceIntegrityVerified, true);
  assert.deepEqual(harness.input.shape, ["N", 3, 112, 112]);
  assert.deepEqual(harness.output.shape, [1, 512]);
  assert.equal(harness.output.l2NormalizedByModel, false);
  assert.match(harness.preprocessingContractDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(harness.preprocessingContractVersion, PREPROCESSING.version);

  for (const key of [
    "executionEnabled",
    "inferenceAuthorized",
    "inferenceExecuted",
    "benchmarkAuthorized",
    "benchmarkExecuted",
    "productUseEligible",
    "rawBiometricPayloadAccepted",
    "binaryPayloadAccepted",
    "sampleReferenceStored",
    "embeddingStored",
    "thresholdApplied",
    "matchedClaimed",
    "identityClaimed",
    "calibrationMutationAllowed",
    "productionAuthorized",
    "productionReady",
    "biometricClaimReady",
  ]) {
    assert.equal(harness[key], false, `${key} must remain false`);
  }
});

test("fails closed when source integrity is not verified", () => {
  const receipt = verifiedReceipt();
  receipt.sourceIntegrityVerified = false;
  receipt.labInferenceEligible = false;

  assert.throws(
    () =>
      createAuraFace512dInferenceHarnessV1({
        materializationReceipt: receipt,
      }),
    (error) => error?.code === "auraface_source_integrity_not_verified",
  );
});

test("fails closed if caller attempts to enable inference execution", () => {
  assert.throws(
    () =>
      createAuraFace512dInferenceHarnessV1({
        materializationReceipt: verifiedReceipt(),
        executionEnabled: true,
      }),
    (error) => error?.code === "auraface_inference_explicit_approval_required",
  );
});

test("fails closed on preprocessing drift", () => {
  const drifted = {
    ...PREPROCESSING,
    preprocessing: {
      ...PREPROCESSING.preprocessing,
      formula: "pixel / 255",
    },
  };

  assert.throws(
    () =>
      createAuraFace512dInferenceHarnessV1({
        materializationReceipt: verifiedReceipt(),
        preprocessingContract: drifted,
      }),
    /formula drift/,
  );
});

test("sample plan stores only a digest of an opaque reference and never executes", () => {
  const harness = createAuraFace512dInferenceHarnessV1({
    materializationReceipt: verifiedReceipt(),
  });
  const sampleRef = "runner-local://trust-face/consented-sample-001";
  const plan = prepareAuraFace512dSampleInferencePlanV1({
    harness,
    sampleRef,
  });

  assert.match(plan.sampleRefDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(plan.sampleRefStored, false);
  assert.equal(plan.samplePayloadStored, false);
  assert.equal(plan.requiresFreshSampleRefAtExecution, true);
  assert.equal(plan.inferenceAuthorized, false);
  assert.equal(plan.inferenceExecuted, false);
  assert.equal(plan.benchmarkAuthorized, false);
  assert.equal(plan.benchmarkExecuted, false);
  assert.equal(plan.productionAuthorized, false);

  assert.equal(JSON.stringify(plan).includes(sampleRef), false);
});

test("sample plan rejects inline image/base64 payloads", () => {
  const harness = createAuraFace512dInferenceHarnessV1({
    materializationReceipt: verifiedReceipt(),
  });

  for (const sampleRef of ["data:image/jpeg;base64,AAAA", "base64:AAAA"]) {
    assert.throws(
      () =>
        prepareAuraFace512dSampleInferencePlanV1({
          harness,
          sampleRef,
        }),
      (error) => error?.code === "auraface_inline_payload_forbidden",
    );
  }
});
