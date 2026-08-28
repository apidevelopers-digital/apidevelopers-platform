
import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_ALIGNMENT_LAB_PROFILE,
  alignFaceFromLandmarks,
  validateLandmarkGeometry,
} from "../src/alignment-lab.mjs";

function fixture() {
  const width = 160, height = 160;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) pixels[y * width + x] = (x * 3 + y * 5) % 256;
  const landmarks = {
    leftEye: { x: 52, y: 60 },
    rightEye: { x: 108, y: 64 },
    nose: { x: 80, y: 88 },
    mouthLeft: { x: 60, y: 112 },
    mouthRight: { x: 102, y: 115 },
  };
  return { width, height, pixels, landmarks };
}

test("alignment lab does not claim detector or production readiness", () => {
  assert.equal(TRUST_FACE_ALIGNMENT_LAB_PROFILE.productionReady, false);
  assert.equal(TRUST_FACE_ALIGNMENT_LAB_PROFILE.biometricClaimReady, false);
  assert.equal(TRUST_FACE_ALIGNMENT_LAB_PROFILE.detectorIncluded, false);
  assert.equal(TRUST_FACE_ALIGNMENT_LAB_PROFILE.landmarkDetectorIncluded, false);
});

test("valid geometry passes and invalid ordering fails closed", () => {
  const f = fixture();
  assert.equal(validateLandmarkGeometry(f.landmarks, f).leftEye.x, 52);
  const invalid = { ...f.landmarks, leftEye: f.landmarks.rightEye, rightEye: f.landmarks.leftEye };
  assert.throws(() => validateLandmarkGeometry(invalid, f), e => e?.code === "invalid_landmark_geometry");
});

test("alignment is deterministic and canonical", () => {
  const f = fixture();
  const a = alignFaceFromLandmarks(f);
  const b = alignFaceFromLandmarks(f);
  assert.equal(a.width, 112);
  assert.equal(a.height, 112);
  assert.deepEqual(a.pixels, b.pixels);
  assert.deepEqual(a.transform, b.transform);
  assert.equal(typeof a.quality.passed, "boolean");
});

test("invalid image payload fails closed", () => {
  const f = fixture();
  assert.throws(
    () => alignFaceFromLandmarks({ ...f, pixels: new Uint8Array(10) }),
    e => e?.code === "invalid_image_pixels",
  );
});
