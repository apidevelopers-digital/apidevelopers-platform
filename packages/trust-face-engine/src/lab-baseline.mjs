
import { createFaceEmbedding } from "./index.mjs";

export const TRUST_FACE_LAB_BASELINE_PROFILE = Object.freeze({
  modelVersion: "trust-face-handcrafted/v0-lab",
  productionReady: false,
  livenessPad: false,
  trainedModel: false,
  input: "aligned-grayscale-face-crop",
  descriptor: "cell-gradient-histogram",
  canonicalWidth: 32,
  canonicalHeight: 32,
  cellsX: 4,
  cellsY: 4,
  orientationBins: 8,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceLabBaselineError";
  error.code = code;
  throw error;
}

function assertDimension(value, field) {
  if (!Number.isInteger(value) || value < 16 || value > 2048) {
    fail("invalid_image_dimension", `${field} must be an integer between 16 and 2048`);
  }
}

function assertPixels(pixels, width, height) {
  const isTyped = pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray;
  if (!isTyped && !Array.isArray(pixels)) {
    fail("invalid_image_pixels", "pixels must be Uint8Array, Uint8ClampedArray, or number[]");
  }
  if (pixels.length !== width * height) {
    fail("invalid_image_pixels", "pixels length must equal width * height");
  }
  const out = new Float64Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 1) {
    const value = Number(pixels[index]);
    if (!Number.isFinite(value) || value < 0 || value > 255) {
      fail("invalid_image_pixels", `pixels[${index}] must be between 0 and 255`);
    }
    out[index] = value;
  }
  return out;
}

function bilinearResize(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const target = new Float64Array(targetWidth * targetHeight);
  const xScale = sourceWidth / targetWidth;
  const yScale = sourceHeight / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.max(0, Math.min(sourceHeight - 1, (y + 0.5) * yScale - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const wy = sourceY - y0;

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.max(0, Math.min(sourceWidth - 1, (x + 0.5) * xScale - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const wx = sourceX - x0;

      const top = source[y0 * sourceWidth + x0] * (1 - wx) + source[y0 * sourceWidth + x1] * wx;
      const bottom = source[y1 * sourceWidth + x0] * (1 - wx) + source[y1 * sourceWidth + x1] * wx;
      target[y * targetWidth + x] = top * (1 - wy) + bottom * wy;
    }
  }
  return target;
}

function standardize(pixels) {
  let sum = 0;
  for (const value of pixels) sum += value;
  const mean = sum / pixels.length;

  let variance = 0;
  for (const value of pixels) {
    const delta = value - mean;
    variance += delta * delta;
  }
  const std = Math.sqrt(variance / pixels.length);
  if (!Number.isFinite(std) || std < 1e-6) {
    fail("image_has_no_texture", "image crop has insufficient intensity variation");
  }

  const normalized = new Float64Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 1) {
    normalized[index] = (pixels[index] - mean) / std;
  }
  return normalized;
}

function gradientDescriptor(pixels, width, height, cellsX, cellsY, bins) {
  const descriptor = new Float64Array(cellsX * cellsY * bins);
  const cellWidth = width / cellsX;
  const cellHeight = height / cellsY;
  const twoPi = Math.PI * 2;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const gx = pixels[y * width + (x + 1)] - pixels[y * width + (x - 1)];
      const gy = pixels[(y + 1) * width + x] - pixels[(y - 1) * width + x];
      const magnitude = Math.hypot(gx, gy);
      if (magnitude <= 1e-12) continue;

      let angle = Math.atan2(gy, gx);
      if (angle < 0) angle += twoPi;
      const bin = Math.min(bins - 1, Math.floor((angle / twoPi) * bins));
      const cellX = Math.min(cellsX - 1, Math.floor(x / cellWidth));
      const cellY = Math.min(cellsY - 1, Math.floor(y / cellHeight));
      descriptor[(cellY * cellsX + cellX) * bins + bin] += magnitude;
    }
  }

  let magnitude = 0;
  for (const value of descriptor) magnitude += value * value;
  magnitude = Math.sqrt(magnitude);
  if (!Number.isFinite(magnitude) || magnitude < 1e-12) {
    fail("image_has_no_gradients", "image crop has insufficient gradients");
  }

  return Array.from(descriptor, (value) => value / magnitude);
}

export function createLabFaceEmbeddingFromGrayImage({
  width,
  height,
  pixels,
  quality = null,
} = {}) {
  assertDimension(width, "width");
  assertDimension(height, "height");

  const source = assertPixels(pixels, width, height);
  const resized = bilinearResize(
    source,
    width,
    height,
    TRUST_FACE_LAB_BASELINE_PROFILE.canonicalWidth,
    TRUST_FACE_LAB_BASELINE_PROFILE.canonicalHeight,
  );
  const standardized = standardize(resized);
  const descriptor = gradientDescriptor(
    standardized,
    TRUST_FACE_LAB_BASELINE_PROFILE.canonicalWidth,
    TRUST_FACE_LAB_BASELINE_PROFILE.canonicalHeight,
    TRUST_FACE_LAB_BASELINE_PROFILE.cellsX,
    TRUST_FACE_LAB_BASELINE_PROFILE.cellsY,
    TRUST_FACE_LAB_BASELINE_PROFILE.orientationBins,
  );

  const embedding = createFaceEmbedding({
    values: descriptor,
    modelVersion: TRUST_FACE_LAB_BASELINE_PROFILE.modelVersion,
    quality,
  });

  return Object.freeze({
    ...embedding,
    source: Object.freeze({
      width,
      height,
      colorSpace: "grayscale",
      alignedFaceCropRequired: true,
    }),
    baselineProfile: TRUST_FACE_LAB_BASELINE_PROFILE,
  });
}
