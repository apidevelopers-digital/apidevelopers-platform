
import assert from "node:assert/strict";
import test from "node:test";
import { cosineSimilarity, createFaceEmbedding } from "../src/index.mjs";
import {
  TRUST_FACE_IMAGE_DESCRIPTOR_BASELINE_V1 as PROFILE,
  createLabImageDescriptorEmbedding,
} from "../src/image-descriptor-baseline-v1.mjs";

function sample(fn = (x, y, c) => (x * 3 + y * 5 + c * 17) % 256) {
  const pixels = new Array(112 * 112 * 3);
  let i = 0;
  for (let y = 0; y < 112; y += 1) {
    for (let x = 0; x < 112; x += 1) {
      for (let c = 0; c < 3; c += 1) pixels[i++] = fn(x, y, c);
    }
  }
  return { width: 112, height: 112, channels: 3, pixels };
}

test("profile is explicit lab-only", () => {
  assert.equal(PROFILE.embeddingDim, 512);
  assert.equal(PROFILE.trainedBiometricWeightsIncluded, false);
  assert.equal(PROFILE.realBiometricModel, false);
  assert.equal(PROFILE.productionReady, false);
  assert.equal(PROFILE.biometricClaimReady, false);
});

test("creates finite normalized 512D embedding", () => {
  const result = createLabImageDescriptorEmbedding({ sample: sample() });
  assert.equal(result.vector.length, 512);
  assert.ok(result.vector.every(Number.isFinite));
  const norm = Math.sqrt(result.vector.reduce((s, v) => s + v * v, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9);
  assert.equal(result.embeddingStored, false);
});

test("is deterministic", () => {
  const s = sample();
  assert.deepEqual(
    createLabImageDescriptorEmbedding({ sample: s }).vector,
    createLabImageDescriptorEmbedding({ sample: s }).vector,
  );
});

test("same sample is cosine 1 through engine contract", () => {
  const result = createLabImageDescriptorEmbedding({ sample: sample() });
  const a = createFaceEmbedding({ values: result.vector, modelVersion: result.modelVersion });
  const b = createFaceEmbedding({ values: result.vector, modelVersion: result.modelVersion });
  assert.ok(Math.abs(cosineSimilarity(a, b) - 1) < 1e-12);
});

test("different pattern produces bounded cosine", () => {
  const a0 = createLabImageDescriptorEmbedding({ sample: sample() });
  const b0 = createLabImageDescriptorEmbedding({ sample: sample((x, y, c) => (255 - x * 2 + y * 7 + c * 11) & 255) });
  const a = createFaceEmbedding({ values: a0.vector, modelVersion: a0.modelVersion });
  const b = createFaceEmbedding({ values: b0.vector, modelVersion: b0.modelVersion });
  const score = cosineSimilarity(a, b);
  assert.ok(score >= -1 && score <= 1);
  assert.ok(score < 0.99);
});

test("rejects invalid shape", () => {
  assert.throws(
    () => createLabImageDescriptorEmbedding({ sample: { width: 111, height: 112, channels: 3, pixels: [] } }),
    (error) => error.code === "invalid_sample_shape",
  );
});

test("rejects invalid pixel range", () => {
  const s = sample();
  s.pixels[20] = 300;
  assert.throws(() => createLabImageDescriptorEmbedding({ sample: s }), (error) => error.code === "invalid_sample_pixel");
});

test("rejects zero-contrast sample", () => {
  assert.throws(
    () => createLabImageDescriptorEmbedding({ sample: sample(() => 127) }),
    (error) => error.code === "insufficient_sample_contrast",
  );
});

test("rejects production execution", () => {
  assert.throws(
    () => createLabImageDescriptorEmbedding({ sample: sample(), execution: { mode: "production", productionAuthorized: true } }),
    (error) => error.code === "production_not_authorized",
  );
});

test("never upgrades biometric readiness flags", () => {
  const result = createLabImageDescriptorEmbedding({ sample: sample() });
  assert.equal(result.trainedBiometricWeightsIncluded, false);
  assert.equal(result.realBiometricModel, false);
  assert.equal(result.independentlyValidated, false);
  assert.equal(result.productionReady, false);
  assert.equal(result.biometricClaimReady, false);
});
