import { createHash } from "node:crypto";

import {
  TRUST_FACE_AURAFACE_512D_CANDIDATE_V1,
  createAuraFace512dCandidateAdmissionV1,
} from "./auraface-512d-candidate-v1.mjs";
import {
  TRUST_FACE_AURAFACE_512D_PREPROCESSING_CONTRACT_V1,
  assertAuraFace512DPreprocessingContractV1,
} from "./auraface-512d-preprocessing-contract-v1.mjs";

export const TRUST_FACE_AURAFACE_512D_INFERENCE_HARNESS_V1 = Object.freeze({
  version: "trust-face-auraface-512d-inference-harness/v1",
  mode: "lab-harness-prepared-execution-disabled",
  modelId: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.modelId,
  embeddingDim: 512,
  executionEnabledByDefault: false,
  rawBiometricPayloadAccepted: false,
  binaryPayloadAccepted: false,
  sampleReferenceStored: false,
  embeddingStored: false,
  inferenceAuthorized: false,
  inferenceExecuted: false,
  benchmarkAuthorized: false,
  benchmarkExecuted: false,
  productionAuthorized: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceAuraFace512dInferenceHarnessV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceAuraFace512dInferenceHarnessV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceAuraFace512dInferenceHarnessV1Error(code, message);
};

const sha256 = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

const canonicalJsonDigest = (value) => sha256(JSON.stringify(value));

function assertMaterializationReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    fail(
      "auraface_materialization_receipt_required",
      "verified AuraFace materialization receipt is required",
    );
  }

  if (receipt.modelId !== TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.modelId) {
    fail(
      "auraface_materialization_model_mismatch",
      "materialization receipt modelId does not match the pinned AuraFace candidate",
    );
  }
  if (receipt.sourceRevision !== TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.sourceRevision) {
    fail(
      "auraface_materialization_revision_mismatch",
      "materialization receipt sourceRevision does not match the pinned AuraFace candidate",
    );
  }
  if (receipt.artifactBytes !== TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.artifactBytes) {
    fail(
      "auraface_materialization_size_mismatch",
      "materialization receipt byte size does not match the pinned AuraFace artifact",
    );
  }
  if (receipt.artifactSha256 !== TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.weightsDigest) {
    fail(
      "auraface_materialization_digest_mismatch",
      "materialization receipt SHA-256 does not match the pinned AuraFace artifact",
    );
  }
  if (receipt.sourceIntegrityVerified !== true || receipt.labInferenceEligible !== true) {
    fail(
      "auraface_source_integrity_not_verified",
      "AuraFace source integrity must be verified before preparing a lab inference harness",
    );
  }
  if (
    receipt.productUseEligible !== false ||
    receipt.benchmarkExecutionAuthorized !== false ||
    receipt.productionAuthorized !== false ||
    receipt.productionReady !== false ||
    receipt.biometricClaimReady !== false
  ) {
    fail(
      "auraface_materialization_safety_drift",
      "materialization receipt must not authorize product use, benchmark, production or biometric claims",
    );
  }

  return receipt;
}

function assertOpaqueSampleRef(value) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(
      "auraface_sample_ref_required",
      "sampleRef must be a non-empty opaque local reference",
    );
  }
  const normalized = value.trim();
  if (normalized.length > 256) {
    fail(
      "auraface_sample_ref_too_long",
      "sampleRef must be at most 256 characters",
    );
  }
  if (/^(data:|base64:)/i.test(normalized)) {
    fail(
      "auraface_inline_payload_forbidden",
      "sampleRef must not contain inline image or base64 payload data",
    );
  }
  return normalized;
}

export function createAuraFace512dInferenceHarnessV1({
  materializationReceipt,
  preprocessingContract = TRUST_FACE_AURAFACE_512D_PREPROCESSING_CONTRACT_V1,
  runtimeAdapterRef = "local-onnxruntime-adapter/pending",
  executionEnabled = false,
} = {}) {
  const receipt = assertMaterializationReceipt(materializationReceipt);
  const contract = assertAuraFace512DPreprocessingContractV1(preprocessingContract);
  const admission = createAuraFace512dCandidateAdmissionV1({
    sourceIntegrityVerified: true,
  });

  if (executionEnabled !== false) {
    fail(
      "auraface_inference_explicit_approval_required",
      "AuraFace inference execution is disabled in harness v1 and requires a separately approved execution gate",
    );
  }

  if (typeof runtimeAdapterRef !== "string" || runtimeAdapterRef.trim() === "") {
    fail(
      "auraface_runtime_adapter_ref_required",
      "runtimeAdapterRef must be a non-empty reference",
    );
  }

  if (
    admission.embeddingDim !== 512 ||
    admission.labInferenceEligible !== true ||
    admission.productUseEligible !== false
  ) {
    fail(
      "auraface_admission_contract_drift",
      "AuraFace admission state is inconsistent with the prepared lab harness",
    );
  }

  return Object.freeze({
    version: TRUST_FACE_AURAFACE_512D_INFERENCE_HARNESS_V1.version,
    mode: TRUST_FACE_AURAFACE_512D_INFERENCE_HARNESS_V1.mode,
    modelId: admission.modelId,
    sourceRevision: admission.sourceRevision,
    artifactBytes: receipt.artifactBytes,
    artifactSha256: receipt.artifactSha256,
    sourceIntegrityVerified: true,
    embeddingDim: 512,
    input: Object.freeze({
      name: contract.onnxInput.name,
      dtype: contract.onnxInput.dtype,
      layout: contract.onnxInput.layout,
      shape: Object.freeze([...contract.onnxInput.shape]),
    }),
    output: Object.freeze({
      name: contract.onnxOutput.name,
      dtype: contract.onnxOutput.dtype,
      shape: Object.freeze([...contract.onnxOutput.shape]),
      embeddingDim: contract.onnxOutput.embeddingDim,
      l2NormalizedByModel: contract.onnxOutput.l2NormalizedByModel,
    }),
    preprocessingContractVersion: contract.version,
    preprocessingContractDigest: canonicalJsonDigest(contract),
    insightFaceRevision: contract.insightFaceRevision,
    runtimeAdapterRef: runtimeAdapterRef.trim(),
    executionEnabled: false,
    inferenceAuthorized: false,
    inferenceExecuted: false,
    benchmarkAuthorized: false,
    benchmarkExecuted: false,
    productEmbeddingDimCompatible: true,
    productUseEligible: false,
    rawBiometricPayloadAccepted: false,
    binaryPayloadAccepted: false,
    sampleReferenceStored: false,
    embeddingStored: false,
    thresholdApplied: false,
    matchedClaimed: false,
    identityClaimed: false,
    calibrationMutationAllowed: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function prepareAuraFace512dSampleInferencePlanV1({
  harness,
  sampleRef,
} = {}) {
  if (
    !harness ||
    harness.version !== TRUST_FACE_AURAFACE_512D_INFERENCE_HARNESS_V1.version ||
    harness.executionEnabled !== false ||
    harness.inferenceAuthorized !== false ||
    harness.inferenceExecuted !== false
  ) {
    fail(
      "auraface_inference_harness_not_fail_closed",
      "a fail-closed AuraFace 512D inference harness v1 is required",
    );
  }

  const normalizedRef = assertOpaqueSampleRef(sampleRef);

  return Object.freeze({
    version: "trust-face-auraface-512d-sample-inference-plan/v1",
    mode: "plan-only-execution-disabled",
    modelId: harness.modelId,
    sourceRevision: harness.sourceRevision,
    artifactSha256: harness.artifactSha256,
    preprocessingContractDigest: harness.preprocessingContractDigest,
    sampleRefDigest: sha256(normalizedRef),
    sampleRefStored: false,
    samplePayloadStored: false,
    rawBiometricPayloadAccepted: false,
    binaryPayloadAccepted: false,
    requiresFreshSampleRefAtExecution: true,
    inferenceAuthorized: false,
    inferenceExecuted: false,
    benchmarkAuthorized: false,
    benchmarkExecuted: false,
    thresholdApplied: false,
    matchedClaimed: false,
    identityClaimed: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
