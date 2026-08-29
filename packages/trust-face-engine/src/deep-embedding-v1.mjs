import { createHash } from "node:crypto";

export const TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE = Object.freeze({
  version: "trust-face-deep-embedding/v1-lab",
  input: Object.freeze({
    width: 112,
    height: 112,
    channels: 3,
    colorSpace: "RGB",
    aligned: true,
  }),
  embeddingDim: 512,
  normalizedEmbedding: true,
  backboneClass: "mobile-residual-cnn",
  lossFamily: "additive-angular-margin",
  qualityAwareTraining: true,
  productionReady: false,
  biometricClaimReady: false,
  trainedWeightsIncluded: false,
  livenessPad: false,
  openSetIdentification: false,
  verification1to1: true,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceDeepEmbeddingV1Error";
  error.code = code;
  throw error;
}

function finite(value, field) {
  if (!Number.isFinite(value)) fail("invalid_number", `${field} must be finite`);
  return value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function norm(vector) {
  if (!Array.isArray(vector) || vector.length === 0) {
    fail("invalid_vector", "vector must be a non-empty numeric array");
  }
  let sum = 0;
  for (const value of vector) {
    finite(value, "vector value");
    sum += value * value;
  }
  return Math.sqrt(sum);
}

export function normalizeDeepEmbedding(vector, expectedDim = TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.embeddingDim) {
  if (!Array.isArray(vector) || vector.length !== expectedDim) {
    fail("invalid_embedding_dimension", `embedding must contain exactly ${expectedDim} values`);
  }
  const magnitude = norm(vector);
  if (magnitude <= 1e-12) fail("zero_embedding", "embedding magnitude must be greater than zero");
  return Object.freeze(vector.map((value) => value / magnitude));
}

export function cosineFromNormalized(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    fail("invalid_cosine_vectors", "cosine vectors must be non-empty and have equal dimensions");
  }
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += finite(a[i], "a") * finite(b[i], "b");
  }
  return clamp(dot, -1, 1);
}

export function arcFaceTargetCosine(cosine, marginRadians = 0.5) {
  finite(cosine, "cosine");
  finite(marginRadians, "marginRadians");
  if (marginRadians < 0 || marginRadians >= Math.PI / 2) {
    fail("invalid_angular_margin", "marginRadians must be >= 0 and < pi/2");
  }
  const theta = Math.acos(clamp(cosine, -1, 1));
  return Math.cos(theta + marginRadians);
}

export function qualityAdaptiveAngularMargin({
  qualityZ,
  baseMargin = 0.5,
  adaptationStrength = 0.35,
  minMultiplier = 0.65,
  maxMultiplier = 1.35,
} = {}) {
  finite(qualityZ, "qualityZ");
  finite(baseMargin, "baseMargin");
  finite(adaptationStrength, "adaptationStrength");
  if (baseMargin <= 0) fail("invalid_base_margin", "baseMargin must be > 0");
  if (adaptationStrength < 0 || adaptationStrength > 1) {
    fail("invalid_adaptation_strength", "adaptationStrength must be between 0 and 1");
  }
  const boundedQuality = clamp(qualityZ, -1, 1);
  const multiplier = clamp(
    1 + boundedQuality * adaptationStrength,
    minMultiplier,
    maxMultiplier,
  );
  return baseMargin * multiplier;
}

export function createAngularMarginLogits({
  embedding,
  classWeights,
  targetIndex,
  scale = 64,
  marginRadians = 0.5,
  qualityZ = null,
  adaptationStrength = 0.35,
} = {}) {
  const feature = normalizeDeepEmbedding(embedding, embedding?.length ?? 0);
  if (!Array.isArray(classWeights) || classWeights.length < 2) {
    fail("invalid_class_weights", "classWeights must contain at least two class vectors");
  }
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= classWeights.length) {
    fail("invalid_target_index", "targetIndex is outside classWeights");
  }
  finite(scale, "scale");
  if (scale <= 0) fail("invalid_scale", "scale must be > 0");

  const effectiveMargin = qualityZ === null
    ? marginRadians
    : qualityAdaptiveAngularMargin({
        qualityZ,
        baseMargin: marginRadians,
        adaptationStrength,
      });

  const logits = classWeights.map((weight, index) => {
    const normalizedWeight = normalizeDeepEmbedding(weight, feature.length);
    const cosine = cosineFromNormalized(feature, normalizedWeight);
    const adjusted = index === targetIndex ? arcFaceTargetCosine(cosine, effectiveMargin) : cosine;
    return adjusted * scale;
  });

  return Object.freeze({
    logits: Object.freeze(logits),
    targetIndex,
    scale,
    marginRadians,
    effectiveMargin,
    qualityAware: qualityZ !== null,
  });
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const FORBIDDEN_EVIDENCE_FIELDS = new Set([
  "image",
  "images",
  "pixels",
  "embedding",
  "embddings",
  "template",
  "templates",
  "name",
  "email",
  "phone",
  "cpf",
  "rg",
  "document",
]);

function assertNoForbiddenFields(value, path = "evidence") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_FIELDS.has(key)) {
      fail("forbidden_biometric_or_pii_field", `${path}.${key} must not be persisted in model evidence`);
    }
    assertNoForbiddenFields(child, `${path}.${key}`);
  }
}

export function createDeepEmbeddingModelManifest({modelId,modelVersion,architecture,training,calibration}={}){for(const[f,i] of Object.entries({modelId,modelVersion}))if(typeof v!=="string"||!v.trim())fail("invalid_model_manifest",`${F} is required`);if(!architecture||typeof architecture!=="object")fail("invalid_model_manifest","architecture is required");if(!training||typeof training!=="object")fail("invalid_model_manifest","training is required");if(typeof training.datasetManifestDigest!=="string"||!training.datasetManifestDigest.startsWith("sha256:"))fail("invalid_dataset_digest","training.datasetManifestDigest must be a sha256 digest");if(typeof training.codeCommit!=="string" || training.codeCommit.length<7)|fail("invalid_training_commit","training.codeCommit is required");if(!Number.isInteger(training.seed))fail("invalid_training_seed","training.seed must be an integer");const manifest={profileVersion:TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.version,modelId:modelId.trim(),modelVersion:modelVersion.trim(),architecture:{inputWidth:architecture.inputWidth??112,inputHeight:architecture.inputHeight??112,channels:architecture.channels??3,embeddingDim:architecture.embeddingDim??512,backboneClass:architecture.backboneClass??"mobile-residual-cnn",parameters:architecture.parameters??null},training:{datasetManifestDigest:training.datasetManifestDigest,codeCommit:training.codeCommit,seed:training.seed,objective:training.objective??"additive-angular-margin",scale:training.scale??64,marginRadians:training.marginRadians??0.5,qualityAware:training.qualityAware===true,epochs:training.epochs??null},calibration:calibration?{datasetManifestDigest:calibration.datasetManifestDigest??null,targetFmr:calibration.targetFmr??null,threshold:calibration.threshold??null}:null,productionReady:false,biometricClaimReady:false,rawBiometricLogging:false};assertNoForbiddenFields(manifest);const digest=`sha256:${createHash("sha256").update(stableStringify(manifest)).digest("hex")}`;return Object.freeze({...manifest,digest})}

export function createOwnedBackboneArchitectureSpec(stageWidths=[64,96,160,256],stageDepths=[1,2,3,2],embeddingDim=512}){if(!Array.isArray(stageWidths)||!Array.isArray(stageDepths)||stageWidths.length!==stageDepths.length||stageWidths.length===0)fail("invalid_backbone_spec","stageWidths and stageDepths must be non-empty arrays with equal length");if(!Number.isInteger(embeddingDim)||embeddingDim<128||embeddingDim>2048)fail("invalid_embedding_dimension","embeddingDim must be an integer between 128 and 2048");const stages=stageWidths.map((width,i)=>{if(!Number.isInteger(width)||width<8)fail("invalid_stage_width",`stageWidths[${i}] is invalid`);const depth=stageDepths[i];if(!Number.isInteger(depth)||depth<1)fail("invalid_stage_depth",`stageDepths[${i}] is invalid`);return Object.freeze({index:i,width,depth,block:"depthwise-separable-residual",downsampleAtEntry:i>0})});return Object.freeze({architectureVersion:"trust-face-mobile-residual/v1",input:TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.input,stem:Object.freeze({operator:"conv3x3",width:stageWidths[0],stride:2,activation:"prelu"}),stages:Object.freeze(stages),head:Object.freeze({operator:"global-depthwise-projection",embeddingDim,normalization:"l2"}),trainingObjective:Object.freeze({family:"additive-angular-margin",qualityAwareExtension:"feature-quality-adaptive-margin"}),trainedWeightsIncluded:false,productionReady:false})}
