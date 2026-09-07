import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_AURAFACE_512D_CANDIDATE_V1 as CANDIDATE,
  createAuraFace512dCandidateAdmissionV1,
} from "../src/auraface-512d-candidate-v1.mjs";

test("pins AuraFace-v1 512D candidate without pretending the artifact is materialized", () => {
  assert.equal(CANDIDATE.embeddingDim, 512);
  assert.equal(CANDIDATE.artifactFormat, "onnx");
  assert.equal(CANDIDATE.artifactBytes, 260694151);
  assert.equal(
    CANDIDATE.weightsDigest,
    "sha256:a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60",
  );
  assert.equal(CANDIDATE.licenseSpdx, "Apache-2.0");
  assert.equal(CANDIDATE.trainingDataProvenanceStatus, "partial");
  assert.equal(CANDIDATE.commercialUseClarified, true);
  assert.equal(CANDIDATE.authenticationUseClarified, false);
  assert.equal(CANDIDATE.independentValidationStatus, "none");
  assert.equal(CANDIDATE.sourceIntegrityVerified, false);
  assert.equal(CANDIDATE.benchmarkExecutionAuthorized, false);
  assert.equal(CANDIDATE.productionReady, false);
});

test("fails closed for lab inference until local source integrity is verified", () => {
  const receipt = createAuraFace512dCandidateAdmissionV1();

  assert.equal(receipt.embeddingDim, 512);
  assert.equal(receipt.productEmbeddingDimCompatible, true);
  assert.equal(receipt.sourceIntegrityVerified, false);
  assert.equal(receipt.labInferenceEligible, false);
  assert.equal(receipt.productUseEligible, false);
  assert.equal(receipt.productionAuthorized, false);
  assert.equal(receipt.productionReady, false);
  assert.equal(receipt.biometricClaimReady, false);
});

test("local integrity would unlock only lab inference, not product use", () => {
  const receipt = createAuraFace512dCandidateAdmissionV1({
    sourceIntegrityVerified: true,
  });

  assert.equal(receipt.sourceIntegrityVerified, true);
  assert.equal(receipt.labInferenceEligible, true);
  assert.equal(receipt.productEmbeddingDimCompatible, true);
  assert.equal(receipt.trainingDataProvenanceStatus, "partial");
  assert.equal(receipt.commercialUseClarified, true);
  assert.equal(receipt.authenticationUseClarified, false);
  assert.equal(receipt.independentValidationStatus, "none");
  assert.equal(receipt.evaluationDigest, null);
  assert.equal(receipt.productUseEligible, false);
  assert.equal(receipt.productionAuthorized, false);
  assert.equal(receipt.productionReady, false);
  assert.equal(receipt.biometricClaimReady, false);
});
