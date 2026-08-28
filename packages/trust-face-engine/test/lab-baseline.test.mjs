import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_LAB_BASELINE_PROFILE,
  createLabFaceEmbeddingFromGrayImage,
} from "../src/lab-baseline.mjs";
import { cosineSimilarity } from "../src/index.mjs";

function syntheticFace(width = 32, height = 32, shiftX = 0) {
  const pixels = new Uint8Array(width * height);
  const cx = width / 2 + shiftX;
  const cy = height / 2;
  const eyeRadius = width * (2.2 / 32);
  const noseHalfWidth = width * (1.2 / 32);
  const noseTopOffset = height * (1 / 32);
  const mouthHalfHeight = height * (1.1 / 32);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / (width * 0.32);
      const dy = (y - cy) / (height * 0.42);
      const ellipse = dx * dx + dy * dy;
      let value = ellipse <= 1 ? 150 : 25;
      const leftEye = Math.hypot(x - (cx - width * 0.11), y - (cy - height * 0.09)) < eyeRadius;
      const rightEye = Math.hypot(x - (cx + width * 0.11), y - (cy - height * 0.09)) < eyeRadius;
      const nose = Math.abs(x - cx) < noseHalfWidth && y > cy - noseTopOffset && y < cy + height * 0.12;
      const mouth = Math.abs(y - (cy + height * 0.16)) < mouthHalfHeight && Math.abs(x - cx) < width * 0.13;
      if (leftEye || rightEye) value = 35;
      if (nose) value = 95;
      if (mouth) value = 55;
      pixels[y * width + x] = value;
    }
  }
  return pixels;
}

test("lab baseline is explicitly non-production and non-trained", () => {
  assert.equal(TRUST_FACE_LAB_BASELINE_PROFILE.productionReady, false);
  assert.equal(TRUST_FACE_LAB_BASELINE_PROFILE.livenessPad, false);
  assert.equal(TRUST_FACE_LAB_BASELINE_PROFILE.trainedModel, false);
  assert.equal(TRUST_FACE_LAB_BASELINE_PROFILE.input, "aligned-grayscale-face-crop");
});

test("gray face crop produces deterministic 128-dimensional normalized embedding", () => {
  const pixels = syntheticFace();
  const first = createLabFaceEmbeddingFromGrayImage({ width: 32, height: 32, pixels });
  const second = createLabFaceEmbeddingFromGrayImage({ width: 32, height: 32, pixels });

  assert.equal(first.vector.length, 128);
  assert.deepEqual(first.vector, second.vector);
  assert.equal(first.modelVersion, "trust-face-handcrafted/v0-lab");
  const magnitude = Math.sqrt(first.vector.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(magnitude - 1) < 1e-12);
});

test("bilinear resize preserves deterministic embedding across source resolutions", () => {
  const small = createLabFaceEmbeddingFromGrayImage({
    width: 32,
    height: 32,
    pixels: syntheticFace(32, 32),
  });

  const large = createLabFaceEmbeddingFromGrayImage({
    width: 64,
    height: 64,
    pixels: syntheticFace(64, 64),
  });

  const similarity = cosineSimilarity(small, large);
  assert.ok(similarity > 0.9);
});

test("different aligned crops change the image-derived embedding", () => {
  const reference = createLabFaceEmbeddingFromGrayImage({
    width: 32,
    height: 32,
    pixels: syntheticFace(32, 32, 0),
  });

  const shifted = createLabFaceEmbeddingFromGrayImage({
    width: 32,
    height: 32,
    pixels: syntheticFace(32, 32, 5),
  });

  const similarity = cosineSimilarity(reference, shifted);
  assert.ok(similarity < 0.99);
});

test("flat image is rejected before embedding", () => {
  assert.throws(
    () => createLabFaceEmbeddingFromGrayImage({
      width: 32,
      height: 32,
      pixels: new Uint8Array(32 * 32).fill(128),
    }),
    (error) => error?.code === "image_has_no_texture",
  );
});

test("invalid pixel count fails closed", () => {
  assert.throws(
    () => createLabFaceEmbeddingFromGrayImage({
      width: 32,
      height: 32,
      pixels: new Uint8Array(100),
    }),
    (error) => error?.code === "invalid_image_pixels",
  );
});
