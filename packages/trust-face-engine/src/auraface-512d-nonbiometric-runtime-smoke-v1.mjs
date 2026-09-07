import {
  TRUST_FACE_AURAFACE_512D_PREPROCESSING_CONTRACT_V1,
  assertAuraFace512DPreprocessingContractV1,
} from "./auraface-512d-preprocessing-contract-v1.mjs";
import {
  createAuraFace512dInferenceHarnessV1,
} from "./auraface-512d-inference-harness-v1.mjs";

export const TRUST_FACE_AURAFACE_512D_NONBIOMETRIC_RUNTIME_SMOKE_V1 = Object.freeze({
  version: "trust-face-auraface-512d-nonbiometric-runtime-smoke/v1",
  mode: "lab-runtime-smoke-nonbiometric",
  purpose: "prove-pinned-512d-runtime-contract-without-biometric-input",
  fixture: Object.freeze({
    generator: "procedural-rgb-gradient-v1",
    generatorVersion: 1,
    width: 112,
    height: 112,
    channels: 3,
    sourceLayout: "HWC",
    pixelDtype: "uint8",
    biometricInput: false,
    humanFaceInput: false,
    identityData: false,
    detectorRequired: false,
    landmarksRequired: false,
    persisted: false,
    formula: Object.freeze({
      r: "(17*x + 13*y + 19) mod 256",
      g: "(5*x + 29*y + 73) mod 256",
      b: "(31*x + 7*y + 151) mod 256",
    }),
  }),
  expected: Object.freeze({
    modelInputName: "data",
    modelInputShape: Object.freeze([1, 3, 112, 112]),
    modelInputDtype: "float32",
    modelOutputName: "1333",
    modelOutputShape: Object.freeze([1, 512]),
    embeddingDim: 512,
    finiteOutputRequired: true,
    nonZeroOutputRequired: true,
    downstreamL2NormalizationRequired: true,
  }),
  safety: Object.freeze({
    biometricInputUsed: false,
    sampleReferenceRequired: false,
    faceDetectionExecuted: false,
    alignmentExecuted: false,
    embeddingPersisted: false,
    benchmarkAuthorized: false,
    benchmarkExecuted: false,
    thresholdApplied: false,
    matchedClaimed: false,
    identityClaimed: false,
    calibrationMutationAllowed: false,
    controlledPilotAuthorized: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  }),
});

export class TrustFaceAuraFace512dNonBiometricRuntimeSmokeV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceAuraFace512dNonBiometricRuntimeSmokeV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceAuraFace512dNonBiometricRuntimeSmokeV1Error(code, message);
};

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function createAuraFace512dNonBiometricRuntimeSmokePlanV1({
  materializationReceipt,
  preprocessingContract = TRUST_FACE_AURAFACE_512D_PREPROCESSING_CONTRACT_V1,
} = {}) {
  const contract = assertAuraFace512DPreprocessingContractV1(preprocessingContract);
  const harness = createAuraFace512dInferenceHarnessV1({
    materializationReceipt,
    preprocessingContract: contract,
    runtimeAdapterRef: "nonbiometric-runtime-smoke/pending",
    executionEnabled: false,
  });

  return Object.freeze({
    version: TRUST_FACE_AURAFACE_512D_NONBIOMETRIC_RUNTIME_SMOKE_V1.version,
    mode: "plan-only-execution-not-performed",
    modelId: harness.modelId,
    sourceRevision: harness.sourceRevision,
    artifactSha256: harness.artifactSha256,
    preprocessingContractDigest: harness.preprocessingContractDigest,
    fixture: TRUST_FACE_AURAFACE_512D_NONBIOMETRIC_RUNTIME_SMOKE_V1.fixture,
    expected: TRUST_FACE_AURAFACE_512D_NONBIOMETRIC_RUNTIME_SMOKE_V1.expected,
    biometricInputUsed: false,
    rawBiometricPayloadAccepted: false,
    sampleReferenceRequired: false,
    faceDetectionExecuted: false,
    alignmentExecuted: false,
    inferenceAuthorized: false,
    inferenceExecuted: false,
    benchmarkAuthorized: false,
    benchmarkExecuted: false,
    thresholdApplied: false,
    matchedClaimed: false,
    identityClaimed: false,
    calibrationMutationAllowed: false,
    controlledPilotAuthorized: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function validateAuraFace512dNonBiometricRuntimeSmokeReceiptV1({
  plan,
  receipt,
} = {}) {
  if (!plan || plan.version !== TRUST_FACE_AURAFACE_512D_NONBIOMETRIC_RUNTIME_SMOKE_V1.version) {
    fail("auraface_nonbiometric_smoke_plan_required", "validated non-biometric smoke plan v1 is required");
  }
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    fail("auraface_nonbiometric_smoke_receipt_required", "runtime smoke receipt must be an object");
  }

  const requiredExact = {
    modelId: plan.modelId,
    sourceRevision: plan.sourceRevision,
    artifactSha256: plan.artifactSha256,
    preprocessingContractDigest: plan.preprocessingContractDigest,
    fixtureGenerator: plan.fixture.generator,
    fixtureGeneratorVersion: plan.fixture.generatorVersion,
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
  };

  for (const [key, expected] of Object.entries(requiredExact)) {
    if (receipt[key] !== expected) {
      fail("auraface_nonbiometric_smoke_receipt_drift", `${key} must remain ${JSON.stringify(expected)}`);
    }
  }

  if (!same(receipt.inputShape, plan.expected.modelInputShape)) {
    fail("auraface_nonbiometric_smoke_input_shape_invalid", "runtime input shape must remain [1,3,112,112]");
  }
  if (!same(receipt.outputShape, plan.expected.modelOutputShape)) {
    fail("auraface_nonbiometric_smoke_output_shape_invalid", "runtime output shape must remain [1,512]");
  }
  if (receipt.inputDtype !== "float32" || receipt.outputDtype !== "float32") {
    fail("auraface_nonbiometric_smoke_dtype_invalid", "runtime input/output dtype must remain float32");
  }
  if (receipt.outputFinite !== true || receipt.outputNonZero !== true) {
    fail("auraface_nonbiometric_smoke_output_invalid", "runtime output must be finite and non-zero");
  }
  if (receipt.downstreamL2NormalizationApplied !== true) {
    fail("auraface_nonbiometric_smoke_l2_required", "downstream L2 normalization must be exercised");
  }
  if (
    typeof receipt.normalizedL2Norm !== "number" ||
    !Number.isFinite(receipt.normalizedL2Norm) ||
    Math.abs(receipt.normalizedL2Norm - 1) > 1e-5
  ) {
    fail("auraface_nonbiometric_smoke_l2_invalid", "normalized L2 norm must be finite and approximately 1");
  }

  return Object.freeze({
    version: "trust-face-auraface-512d-nonbiometric-runtime-smoke-receipt/v1",
    mode: "lab-runtime-smoke-nonbiometric",
    modelId: plan.modelId,
    sourceRevision: plan.sourceRevision,
    artifactSha256: plan.artifactSha256,
    preprocessingContractDigest: plan.preprocessingContractDigest,
    fixtureGenerator: plan.fixture.generator,
    fixtureGeneratorVersion: plan.fixture.generatorVersion,
    inputShape: Object.freeze([...receipt.inputShape]),
    inputDtype: receipt.inputDtype,
    outputShape: Object.freeze([...receipt.outputShape]),
    outputDtype: receipt.outputDtype,
    outputFinite: true,
    outputNonZero: true,
    downstreamL2NormalizationApplied: true,
    normalizedL2Norm: receipt.normalizedL2Norm,
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
    productionReady: false,
    biometricClaimReady: false,
  });
}
