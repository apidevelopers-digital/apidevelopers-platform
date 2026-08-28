import assert from "node:assert/strict";
import test from "node:test";

import { trainDetectorLandmarkModel } from "../src/detector-landmarks-lab.mjs";
import { trainMetricModel } from "../src/metric-lab.mjs";
import { TRUST_FACE_EVALUATION_LAB_PROFILE, evaluateTrustFacePipeline } from "../src/evaluation-lab.mjs";
import { createLabFaceEmbeddingFromGrayImage } from "../src/lab-baseline.mjs";
import { alignFaceFromLandmarks } from "../src/alignment-lab.mjs";

function image(facePresent, shift = 0) {
  const width = 32, height = 32;
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

function detectorTraining() {
  return [
    { ...image(true, -1), facePresent: true, landmarks: landmarks(-1) },
    { ...image(true, 0), facePresent: true, landmarks: landmarks(0) },
    { ...image(true, 1), facePresent: true, landmarks: landmarks(1) },
    { ...image(false, 0), facePresent: false },
    { ...image(false, 1), facePresent: false },
    { ...image(false, 2), facePresent: false },
  ];
}

function descriptor(sample) {
  const aligned = alignFaceFromLandmarks({ ...sample, landmarks: sample.landmarks });
  return createLabFaceEmbeddingFromGrayImage({ width: aligned.width, height: aligned.height, pixels: aligned.pixels }).vector;
}

function metricTraining() {
  const a1 = { ...image(true, -1), landmarks: landmarks(-1) };
  const a2 = { ...image(true, 0), landmarks: landmarks(0) };
  const b1 = { ...image(true, 1), landmarks: landmarks(1) };
  const b2 = { ...image(true, 2), landmarks: landmarks(2) };
  return [
    { subjectId: "a", vector: descriptor(a1) },
    { subjectId: "a", vector: descriptor(a2) },
    { subjectId: "b", vector: descriptor(b1) },
    { subjectId: "b", vector: descriptor(b2) },
  ];
}

test("evaluation profile forbids production and biometric claims", () => {
  assert.equal(TRUST_FACE_EVALUATION_LAB_PROFILE.productionReady, false);
  assert.equal(TRUST_FACE_EVALUATION_LAB_PROFILE.biometricClaimReady, false);
  assert.equal(TRUST_FACE_EVALUATION_LAB_PROFILE.rawBiometricLogging, false);
});

test("synthetic evaluation reports detector and verification metrics", () => {
  const detectorModel = trainDetectorLandmarkModel({ samples: detectorTraining() });
  const metricModel = trainMetricModel({ samples: metricTraining() });

  const samples = [
    { sampleId: "a1", subjectId: "a", facePresent: true, ...image(true, -1), landmarks: landmarks(-1) },
    { sampleId: "a2", subjectId: "a", facePresent: true, ...image(true, 0), landmarks: landmarks(0) },
    { sampleId: "b1", subjectId: "b", facePresent: true, ...image(true, 1), landmarks: landmarks(1) },
    { sampleId: "b2", subjectId: "b", facePresent: true, ...image(true, 2), landmarks: landmarks(2) },
    { sampleId: "n1", subjectId: null, facePresent: false, ...image(false, 3) },
  ];

  const report = evaluateTrustFacePipeline({
    detectorModel,
    metricModel,
    dataset: { datasetId: "synthetic-e2e-v0", authority: { basis: "synthetic" }, samples },
    verificationPairs: [
      { referenceSampleId: "a1", probeSampleId: "a2", sameSubject: true },
      { referenceSampleId: "a1", probeSampleId: "b1", sameSubject: false },
    ],
    thresholds: [0.5, 0.7, 0.9],
  });

  assert.equal(report.dataset.authorityBasis, "synthetic");
  assert.equal(report.detection.samples, 5);
  assert.ok(report.detection.precision >= 0 && report.detection.precision <= 1);
  assert.ok(report.detection.recall >= 0 && report.detection.recall <= 1);
  assert.ok(report.detection.landmarkNme === null || report.detection.landmarkNme >= 0);
  assert.equal(report.verification.operatingPoints.length, 3);
  assert.equal(report.productionReady, false);
});

test("unsupported dataset authority fails closed", () => {
  const detectorModel = trainDetectorLandmarkModel({ samples: detectorTraining() });
  const metricModel = trainMetricModel({ samples: metricTraining() });
  assert.throws(
    () => evaluateTrustFacePipeline({
      detectorModel,
      metricModel,
      dataset: { authority: { basis: "unknown" }, samples: [] },
      verificationPairs: [{}, {}],
    }),
    error => error?.code === "unsupported_dataset_authority",
  );
});
