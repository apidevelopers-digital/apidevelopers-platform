import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE,
  arcFaceTargetCosine,
  createAngularMarginLogits,
  createDeepEmbeddingModelManifest,
  createOwnedBackboneArchitectureSpec,
  normalizeDeepEmbedding,
  qualityAdaptiveAngularMargin,
} from "../src/deep-embedding-v1.mjs";

function basis(dim, index, value = 1) {
  return Array.from({ length: dim }, (_, i) => i === index ? value : 0);
}

test("deep embedding v1 profile fixes the owned 112 RGB -> 512D boundary without production claims", () => {
  assert.equal(TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.input.width, 112);
  assert.equal(TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.input.height, 112);
  assert.equal(TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.input.channels, 3);
  assert.equal(TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.embeddingDim, 512);
  assert.equal(TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.productionReady, false);
  assert.equal(TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.biometricClaimReady, false);
  assert.equal(TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.trainedWeightsIncluded, false);
  assert.equal(TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.openSetIdentification, false);
  assert.equal(TRUST_FACE_DEEP_EMBEDDING_V1_PROFILE.verification1to1, true);
});

test("ArcFace-style additive angular margin lowers the target cosine and keeps non-target logits unchanged", () => {
  const cosine = 0.8;
  assert.ok(arcFaceTargetCosine(cosine, 0.5) < cosine);

  const embedding = [1, 1, 0, 0];
  const weights = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
  ];
  const marginResult = createAngularMarginLogits({
    embedding,
    classWeights: weights,
    targetIndex: 0,
    scale: 32,
    marginRadians: 0.5,
  });
  const noMarginResult = createAngularMarginLogits({
    embedding,
    classWeights: weights,
    targetIndex: 0,
    scale: 32,
    marginRadians: 0,
  });

  assert.ok(marginResult.logits[0] < noMarginResult.logits[0]);
  assert.equal(marginResult.logits[1], noMarginResult.logits[1]);
});

test("quality-adaptive margin is bounded and increases with normalized quality", () => {
  const low = qualityAdaptiveAngularMargin({ qualityZ: -1, baseMargin: 0.5 });
  const mid = qualityAdaptiveAngularMargin({ qualityZ: 0, baseMargin: 0.5 });
  const high = qualityAdaptiveAngularMargin({ qualityZ: 1, baseMargin: 0.5 });
  assert.ok(low < mid);
  assert.ok(mid < high);
  assert.ok(low >= 0.325);
  assert.ok(high <= 0.675);
});

test("normalized 512D embeddings are unit length", () => {
  const vector = basis(512, 7, 3);
  const normalized = normalizeDeepEmbedding(vector);
  const norm = Math.sqrt(normalized.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-12);
});

test("owned backbone spec is auditable and does not pretend trained weights exist", () => {
  const spec = createOwnedBackboneArchitectureSpec();
  assert.equal(spec.architectureVersion, "trust-face-mobile-residual/v1");
  assert.equal(spec.head.embeddingDim, 512);
  assert.equal(spec.stages.length, 4);
  assert.equal(spec.trainedWeightsIncluded, false);
  assert.equal(spec.productionReady, false);
});

test("model manifest is deterministic, versioned, and rejects raw biometric or PII payloads", () => {
  const input = {
    modelId: "trust-face-deep-embedding",
    modelVersion: "0.1.0-lab",
    architecture: {
      inputWidth: 112,
      inputHeight: 112,
      channels: 3,
      embeddingDim: 512,
      backboneClass: "mobile-residual-cnn",
      parameters: 1234567,
    },
    training: {
      datasetManifestDigest: `sha256:${"a".repeat(64)}`,
      codeCommit: "0123456789abcdef",
      seed: 42,
      objective: "additive-angular-margin",
      scale: 64,
      marginRadians: 0.5,
      qualityAware: true,
      epochs: 10,
    },
    calibration: {
      datasetManifestDigest: `sha256:${"b".repeat(64)}`,
      targetFmr: 0.001,
      threshold: 0.73,
    },
  };

  const a = createDeepEmbeddingModelManifest(input);
  const b = createDeepEmbeddingModelManifest(input);
  assert.equal(a.digest, b.digest);
  assert.ok(a.digest.startsWith("sha256:"));
  assert.equal(a.productionReady, false);
  assert.equal(a.biometricClaimReady, false);

  assert.throws(
    () => createDeepEmbeddingModelManifest({
      ...input,
      training: {
        ...input.training,
        images: ["raw-face"],
      },
    }),
    (error) => error?.code === "forbidden_biometric_or_pii_field",
  );
});
