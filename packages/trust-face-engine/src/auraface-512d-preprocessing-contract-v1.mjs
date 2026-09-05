const ARCFACE_TEMPLATE_112 = Object.freeze([
  Object.freeze([38.2946, 51.6963]),
  Object.freeze([73.5318, 51.5014]),
  Object.freeze([56.0252, 71.7366]),
  Object.freeze([41.5493, 92.3655]),
  Object.freeze([70.7299, 92.2041]),
]);

export const TRUST_FACE_AURAFACE_512D_PREPROCESSING_CONTRACT_V1 = Object.freeze({
  version: "trust-face-auraface-512d-preprocessing-contract/v1",
  mode: "lab-contract-only",
  modelId: "fal-auraface-v1-glintr100-512d",
  modelSourceRevision: "af6d057c9b0ec4071d4c49c80e3539258798b609",
  insightFaceRevision: "7fadd420c2351d0ffa8cac403421c1a3ed733365",
  evidence: Object.freeze({
    onnxContractPath: "packages/trust-face-engine/docs/AURAFACE_512D_ONNX_CONTRACT_V1.json",
    insightFaceArcFaceOnnxPath: "python-package/insightface/model_zoo/arcface_onnx.py",
    insightFaceArcFaceOnnxBlobSha: "b537ce2ee15d4a1834d54e185f34e336aab30a77",
    insightFaceFaceAlignPath: "python-package/insightface/utils/face_align.py",
    insightFaceFaceAlignBlobSha: "226628b39cf743947df230feffbb97bf5c585e1d",
    insightFaceFaceCommonPath: "python-package/insightface/app/common.py",
    insightFaceFaceCommonBlobSha: "5d5645b196b0492f5872cd54428e2ca5b279e965",
  }),
  onnxInput: Object.freeze({
    name: "data",
    dtype: "float32",
    layout: "NCHW",
    shape: Object.freeze(["N", 3, 112, 112]),
  }),
  onnxOutput: Object.freeze({
    name: "1333",
    dtype: "float32",
    shape: Object.freeze([1, 512]),
    embeddingDim: 512,
    l2NormalizedByModel: false,
  }),
  graph: Object.freeze({
    opset: 11,
    entryPathOperatorTypesUntilFirstConv: Object.freeze(["Conv"]),
    entryNormalizationEmbedded: false,
  }),
  alignment: Object.freeze({
    method: "insightface-arcface-norm_crop",
    landmarkCount: 5,
    imageSize: 112,
    transform: "SimilarityTransform",
    warp: "cv2.warpAffine",
    borderValue: 0,
    template: ARCFACE_TEMPLATE_112,
  }),
  preprocessing: Object.freeze({
    alignedImageConvention: "OpenCV-BGR",
    modelInputChannelOrder: "RGB",
    swapRB: true,
    scaleFactor: 1 / 127.5,
    mean: Object.freeze([127.5, 127.5, 127.5]),
    std: Object.freeze([127.5, 127.5, 127.5]),
    formula: "(pixel - 127.5) / 127.5",
    normalizationEmbeddedInOnnx: false,
  }),
  postprocessing: Object.freeze({
    rawEmbeddingReturnedByOnnx: true,
    l2NormalizationRequiredDownstream: true,
    cosineComparisonRequiresNormalization: true,
  }),
  safety: Object.freeze({
    inferenceExecuted: false,
    benchmarkExecuted: false,
    thresholdApplied: false,
    matchedClaimed: false,
    identityClaimed: false,
    calibrationMutationAllowed: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  }),
});

export function assertAuraFace512DPreprocessingContractV1(
  contract = TRUST_FACE_AURAFACE_512D_PREPROCESSING_CONTRACT_V1,
) {
  if (!contract || typeof contract !== "object") {
    throw new TypeError("AuraFace preprocessing contract must be an object");
  }
  if (contract.onnxInput?.name !== "data") {
    throw new Error("AuraFace ONNX input name must remain data");
  }
  if (contract.onnxInput?.layout !== "NCHW") {
    throw new Error("AuraFace ONNX input layout must remain NCHW");
  }
  if (JSON.stringify(contract.onnxInput?.shape) !== JSON.stringify(["N", 3, 112, 112])) {
    throw new Error("AuraFace ONNX input shape must remain [N,3,112,112]");
  }
  if (contract.onnxOutput?.embeddingDim !== 512) {
    throw new Error("AuraFace ONNX output must remain 512D");
  }
  if (contract.graph?.entryNormalizationEmbedded !== false) {
    throw new Error("AuraFace graph must not claim embedded input normalization");
  }
  if (contract.preprocessing?.swapRB !== true) {
    throw new Error("AuraFace preprocessing must preserve InsightFace swapRB=true");
  }
  if (contract.preprocessing?.formula !== "(pixel - 127.5) / 127.5") {
    throw new Error("AuraFace preprocessing formula drift detected");
  }
  if (contract.alignment?.landmarkCount !== 5 || contract.alignment?.imageSize !== 112) {
    throw new Error("AuraFace alignment must remain 5-point 112x112 ArcFace norm_crop");
  }
  if (contract.postprocessing?.l2NormalizationRequiredDownstream !== true) {
    throw new Error("AuraFace raw output must require downstream L2 normalization");
  }
  if (Object.values(contract.safety ?? {}).some((value) => value !== false)) {
    throw new Error("AuraFace preprocessing contract must not authorize inference, claims or production");
  }
  return contract;
}
