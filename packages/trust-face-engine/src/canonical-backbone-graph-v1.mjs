import {
  createOwnedBackboneArchitectureSpec,
  createAngularMarginLogits,
  normalizeDeepEmbedding,
} from "./deep-embedding-v1.mjs";

export const TRUST_FACE_CANONICAL_BACKBONE_GRAPH_V1 = Object.freeze({
  version: "trust-face-canonical-backbone-graph/v1",
  productionReady: false,
  biometricClaimReady: false,
  biometricBackboneReady: false,
  fullBackpropReady: false,
  realBiometricTrainingAuthorized: false,
  verification1to1: true,
  openSetIdentification: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceCanonicalBackboneGraphV1Error";
  error.code = code;
  throw error;
}

export function createCanonicalBackboneTrainingGraph() {
  const architecture = createOwnedBackboneArchitectureSpec();
  const expectedWidths = [64, 96, 160, 256];
  const expectedDepths = [1, 2, 3, 2];

  const widths = architecture.stages.map((stage) => stage.width);
  const depths = architecture.stages.map((stage) => stage.depth);

  if (JSON.stringify(widths) !== JSON.stringify(expectedWidths)) {
    fail("canonical_width_mismatch", "canonical stage widths must be 64/96/160/256");
  }
  if (JSON.stringify(depths) !== JSON.stringify(expectedDepths)) {
    fail("canonical_depth_mismatch", "canonical stage depths must be 1/2/3/2");
  }
  if (architecture.head.embeddingDim !== 512 || architecture.head.normalization !== "l2") {
    fail("canonical_head_mismatch", "canonical head must be 512D with L2 normalization");
  }

  const blocks = [];
  for (const stage of architecture.stages) {
    for (let blockIndex = 0; blockIndex < stage.depth; blockIndex += 1) {
      blocks.push(Object.freeze({
        stageIndex: stage.index,
        blockIndex,
        width: stage.width,
        operator: stage.block,
        downsampleAtEntry: stage.downsampleAtEntry && blockIndex === 0,
        residual: true,
      }));
    }
  }

  if (blocks.length !== 8) {
    fail("canonical_block_count_mismatch", "canonical graph must contain exactly 8 residual blocks");
  }

  return Object.freeze({
    profile: TRUST_FACE_CANONICAL_BACKBONE_GRAPH_V1,
    architectureVersion: architecture.architectureVersion,
    input: architecture.input,
    stem: architecture.stem,
    stages: architecture.stages,
    blocks: Object.freeze(blocks),
    head: architecture.head,
    trainingObjective: architecture.trainingObjective,
    blockCount: blocks.length,
    stageWidths: Object.freeze(widths),
    stageDepths: Object.freeze(depths),
    embeddingDim: architecture.head.embeddingDim,
    productionReady: false,
    biometricClaimReady: false,
    biometricBackboneReady: false,
    fullBackpropReady: false,
  });
}

function deterministicVector(dim, offset) {
  const raw = Array.from({ length: dim }, (_, index) =>
    Math.sin((index + 1) * (offset + 1) * 0.017) +
    Math.cos((index + 3) * (offset + 2) * 0.011)
  );
  return normalizeDeepEmbedding(raw, dim);
}

function crossEntropy(logits, targetIndex) {
  const max = Math.max(...logits);
  const exps = logits.map((value) => Math.exp(value - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return -Math.log(exps[targetIndex] / sum);
}

export function runCanonicalAngularMarginContractSmoke({
  classCount = 4,
  targetIndex = 1,
  scale = 64,
  marginRadians = 0.5,
  qualityZ = 0,
} = {}) {
  if (!Number.isInteger(classCount) || classCount < 2 || classCount > 64) {
    fail("invalid_class_count", "classCount must be an integer between 2 and 64");
  }
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= classCount) {
    fail("invalid_target_index", "targetIndex is outside classCount");
  }

  const graph = createCanonicalBackboneTrainingGraph();
  const embedding = deterministicVector(graph.embeddingDim, 7);
  const classWeights = Array.from({ length: classCount }, (_, index) =>
    deterministicVector(graph.embeddingDim, index + 20)
  );

  const result = createAngularMarginLogits({
    embedding,
    classWeights,
    targetIndex,
    scale,
    marginRadians,
    qualityZ,
  });

  const loss = crossEntropy(result.logits, targetIndex);
  if (!Number.isFinite(loss)) {
    fail("non_finite_loss", "angular-margin smoke loss must be finite");
  }

  return Object.freeze({
    graphVersion: graph.profile.version,
    architectureVersion: graph.architectureVersion,
    blockCount: graph.blockCount,
    stageWidths: graph.stageWidths,
    stageDepths: graph.stageDepths,
    embeddingDim: graph.embeddingDim,
    objectiveFamily: graph.trainingObjective.family,
    qualityAware: result.qualityAware,
    effectiveMargin: result.effectiveMargin,
    finiteLoss: true,
    loss,
    fullBackpropReady: false,
    biometricBackboneReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
