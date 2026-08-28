
export const TRUST_FACE_ALIGNMENT_LAB_PROFILE = Object.freeze({
  version: "trust-face-alignment/v0-lab",
  productionReady: false,
  biometricClaimReady: false,
  detectorIncluded: false,
  landmarkDetectorIncluded: false,
  canonicalWidth: 112,
  canonicalHeight: 112,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceAlignmentLabError";
  error.code = code;
  throw error;
}

function point(value, field) {
  if (!value || typeof value !== "object") fail("invalid_landmark", `${field} must be an object`);
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) fail("invalid_landmark", `${field} coordinates must be finite`);
  return Object.freeze({ x, y });
}

export function validateLandmarkGeometry(landmarks, { width, height } = {}) {
  const keys = ["leftEye", "rightEye", "nose", "mouthLeft", "mouthRight"];
  if (!landmarks || typeof landmarks !== "object") fail("invalid_landmarks", "landmarks are required");
  const out = {};
  for (const key of keys) {
    out[key] = point(landmarks[key], key);
    if (Number.isFinite(width) && Number.isFinite(height)) {
      if (out[key].x < 0 || out[key].x >= width || out[key].y < 0 || out[key].y >= height) {
        fail("landmark_out_of_bounds", `${key} is outside image bounds`);
      }
    }
  }
  if (out.leftEye.x >= out.rightEye.x) fail("invalid_landmark_geometry", "leftEye must be left of rightEye");
  if (out.mouthLeft.x >= out.mouthRight.x) fail("invalid_landmark_geometry", "mouthLeft must be left of mouthRight");
  const eyeY = (out.leftEye.y + out.rightEye.y) / 2;
  const mouthY = (out.mouthLeft.y + out.mouthRight.y) / 2;
  if (!(out.nose.y > eyeY && out.nose.y < mouthY)) fail("invalid_landmark_geometry", "nose must lie between eye and mouth lines");
  return Object.freeze(out);
}

function transformFromEyes(left, right, targetLeft, targetRight) {
  const sdx = right.x - left.x;
  const sdy = right.y - left.y;
  const tdx = targetRight.x - targetLeft.x;
  const tdy = targetRight.y - targetLeft.y;
  const sourceDistance = Math.hypot(sdx, sdy);
  if (sourceDistance < 6) fail("degenerate_landmarks", "eye distance too small");
  const scale = Math.hypot(tdx, tdy) / sourceDistance;
  const angle = Math.atan2(tdy, tdx) - Math.atan2(sdy, sdx);
  const a = scale * Math.cos(angle);
  const b = scale * Math.sin(angle);
  return Object.freeze({
    a, b,
    tx: targetLeft.x - (a * left.x - b * left.y),
    ty: targetLeft.y - (b * left.x + a * left.y),
    scale,
    rotationRadians: angle,
  });
}

function invert(t) {
  const d = t.a * t.a + t.b * t.b;
  if (d <= 1e-12) fail("invalid_transform", "transform is not invertible");
  return {
    a: t.a / d,
    b: -t.b / d,
    tx: (-t.a * t.tx - t.b * t.ty) / d,
    ty: (t.b * t.tx - t.a * t.ty) / d,
  };
}

function sample(pixels, width, height, x, y) {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return 0;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const wx = x - x0, wy = y - y0;
  const top = pixels[y0 * width + x0] * (1 - wx) + pixels[y0 * width + x1] * wx;
  const bottom = pixels[y1 * width + x0] * (1 - wx) + pixels[y1 * width + x1] * wx;
  return Math.round(top * (1 - wy) + bottom * wy);
}

export function alignFaceFromLandmarks({ width, height, pixels, landmarks, outputWidth = 112, outputHeight = 112 } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16) fail("invalid_image_dimensions", "invalid image dimensions");
  if (!(pixels instanceof Uint8Array) || pixels.length !== width * height) fail("invalid_image_pixels", "pixels must be Uint8Array(width*height)");
  const source = validateLandmarkGeometry(landmarks, { width, height });
  const targetLeft = { x: outputWidth * 0.315, y: outputHeight * 0.385 };
  const targetRight = { x: outputWidth * 0.685, y: outputHeight * 0.385 };
  const transform = transformFromEyes(source.leftEye, source.rightEye, targetLeft, targetRight);
  const inverse = invert(transform);
  const aligned = new Uint8Array(outputWidth * outputHeight);
  let outOfBounds = 0;

  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const sx = inverse.a * x - inverse.b * y + inverse.tx;
      const sy = inverse.b * x + inverse.a * y + inverse.ty;
      if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) outOfBounds += 1;
      aligned[y * outputWidth + x] = sample(pixels, width, height, sx, sy);
    }
  }

  return Object.freeze({
    width: outputWidth,
    height: outputHeight,
    pixels: aligned,
    colorSpace: "grayscale",
    transform,
    quality: Object.freeze({
      outOfBoundsRatio: outOfBounds / aligned.length,
      passed: outOfBounds / aligned.length <= 0.25,
    }),
    profile: TRUST_FACE_ALIGNMENT_LAB_PROFILE,
  });
}
