
import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_DETECTOR_LAB_PROFILE,
  detectFaceLandmarks,
  trainDetectorLandmarkModel,
} from "../src/detector-landmarks-lab.mjs";

function image(facePresent, shift = 0) {
  const width = 32;
  const height = 32;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (facePresent) {
        const dx = x - (16 + shift);
        const dy = y - 16;
        pixels[y * width + x] = dx * dx + dy * dy < 95 ? 190 : 25;
      } else {
        pixels[y * width + x] = ((x * 17 + y * 29 + shift * 11) % 97) + 20;
      }
    }
  }
  return { width, height, pixels };
}

function landmarks(shift = 0) {
  return {
    leftEye: { x: 11 + shift, y: 12 },
    rightEye: { x: 21 + shift, y: 12 },
    nose: { x: 16 + shift, y: 17 },
    mouthLeft: { x: 12 + shift, y: 22 },
    mouthRight: { x: 20 + shift, y: 22 },
  };
}

function trainingSamples() {
  return [
    { ...image(true, -1), facePresent: true, landmarks: landmarks(-1) },
    { ...image(true, 0), facePresent: true, landmarks: landmarks(0) },
    { ...image(true, 1), facePresent: true, landmarks: landmarks(1) },
    { ...image(false, 0), facePresent: false },
    { ...image(false, 1), facePresent: false },
    { ...image(false, 2), facePresent: false },
  ];
}

test("detector lab explicitly forbids production claims", () => {
  assert.equal(TRUST_FACE_DETECTOR_LAB_PROFILE.productionReady, false);
  assert.equal(TRUST_FACE_DETECTOR_LAB_PROFILE.biometricClaimReady, false);
  assert.equal(TRUST_FACE_DETECTOR_LAB_PROFILE.livenessPad, false);
  assert.equal(TRUST_FACE_DETECTOR_LAB_PROFILE.trainedModel, true);
});

test("training is deterministic and records balanced summary", () => {
  const a = trainDetectorLandmarkModel({ samples: trainingSamples() });
  const b = trainDetectorLandmarkModel({ samples: trainingSamples() });
  assert.deepEqual(a.positiveCentroid, b.positiveCentroid);
  assert.deepEqual(a.negativeCentroid, b.negativeCentroid);
  assert.equal(a.trainingSummary.positiveCount, 3);
  assert.equal(a.trainingSummary.negativeCount, 3);
});

test("trained lab model detects positive fixture and estimates five landmarks", () => {
  const model = trainDetectorLandmarkModel({ samples: trainingSamples() });
  const result = detectFaceLandmarks({ model, ...image(true, 0) });
  assert.equal(result.facePresent, true);
  assert.ok(result.confidence >= 0);
  assert.deepEqual(Object.keys(result.landmarks).sort(), ["leftEye","mouthLeft","mouthRight","nose","rightEye"].sort());
  assert.ok(Math.abs(result.landmarks.nose.x - 16) < 3);
  assert.equal(result.productionReady, false);
});

test("trained lab model rejects negative fixture", () => {
  const model = trainDetectorLandmarkModel({ samples: trainingSamples() });
  const result = detectFaceLandmarks({ model, ...image(false, 3) });
  assert.equal(result.facePresent, false);
  assert.equal(result.landmarks, null);
});

test("training fails closed when class balance is insufficient", () => {
  const bad = trainingSamples().slice(0, 5).filter((sample) => sample.facePresent);
  assert.throws(
    () => trainDetectorLandmarkModel({ samples: [...bad, ...bad] }),
    (error) => error?.code === "insufficient_class_balance",
  );
});
