import assert from "node:assert/strict";
import test from "node:test";

import { trainDetectorLandmarkModel, detectFaceLandmarks } from "../src/detector-landmarks-lab.mjs";
import { alignFaceFromLandmarks } from "../src/alignment-lab.mjs";
import { createLabFaceEmbeddingFromGrayImage } from "../src/lab-baseline.mjs";
import { applyMetricModel, scoreVerificationPair } from "../src/metric-lab.mjs";
import { evaluateTrustFacePipeline } from "../src/evaluation-lab.mjs";

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

function baselineVector(sample, detectorModel) {
  const detection = detectFaceLandmarks({ model: detectorModel, ...sample });
  assert.equal(detection.facePresent, true);
  const aligned = alignFaceFromLandmarks({ ...sample, landmarks: detection.landmarks });
  assert.equal(aligned.quality.passed, true);
  return createLabFaceEmbeddingFromGrayImage({
    width: aligned.width,
    height: aligned.height,
    pixels: aligned.pixels,
  }).vector;
}

function confusion(genuineScore, impostorScore, threshold) {
  return {
    fmr: impostorScore >= threshold ? 1 : 0,
    fnmr: genuineScore < threshold ? 1 : 0,
  };
}

test("evaluation applies metric model exactly once per verification vector", () => {
  const detectorModel = trainDetectorLandmarkModel({ samples: detectorTraining() });
  const metricModel = {
    modelVersion: "trust-face-metric/regression-single-application",
    weights: Array.from({ length: 128 }, (_, index) => (index % 8 === 0 ? 8 : index % 3 === 0 ? 0.25 : 1)),
  };

  const a1 = { sampleId: "a1", subjectId: "a", facePresent: true, ...image(true, -1), landmarks: landmarks(-1) };
  const a2 = { sampleId: "a2", subjectId: "a", facePresent: true, ...image(true, 0), landmarks: landmarks(0) };
  const b1 = { sampleId: "b1", subjectId: "b", facePresent: true, ...image(true, 2), landmarks: landmarks(2) };
  const n1 = { sampleId: "n1", subjectId: null, facePresent: false, ...image(false, 3) };

  const va1 = baselineVector(a1, detectorModel);
  const va2 = baselineVector(a2, detectorModel);
  const vb1 = baselineVector(b1, detectorModel);

  const genuineSingle = scoreVerificationPair({
    model: metricModel,
    referenceVector: va1,
    probeVector: va2,
  });
  const impostorSingle = scoreVerificationPair({
    model: metricModel,
    referenceVector: va1,
    probeVector: vb1,
  });

  const genuineDouble = scoreVerificationPair({
    model: metricModel,
    referenceVector: applyMetricModel({ model: metricModel, vector: va1 }).vector,
    probeVector: applyMetricModel({ model: metricModel, vector: va2 }).vector,
  });
  const impostorDouble = scoreVerificationPair({
    model: metricModel,
    referenceVector: applyMetricModel({ model: metricModel, vector: va1 }).vector,
    probeVector: applyMetricModel({ model: metricModel, vector: vb1 }).vector,
  });

  const candidates = [
    (genuineSingle + genuineDouble) / 2,
    (impostorSingle + impostorDouble) / 2,
  ];
  const threshold = candidates.find((value) => {
    const single = confusion(genuineSingle, impostorSingle, value);
    const double = confusion(genuineDouble, impostorDouble, value);
    return single.fmr !== double.fmr || single.fnmr !== double.fnmr;
  });

  assert.ok(Number.isFinite(threshold), "fixture must distinguish single from double metric application");

  const expected = confusion(genuineSingle, impostorSingle, threshold);
  const rejected = confusion(genuineDouble, impostorDouble, threshold);
  assert.notDeepEqual(expected, rejected);

  const report = evaluateTrustFacePipeline({
    detectorModel,
    metricModel,
    dataset: {
      datasetId: "metric-single-application-regression",
      authority: { basis: "synthetic" },
      samples: [a1, a2, b1, n1],
    },
    verificationPairs: [
      { referenceSampleId: "a1", probeSampleId: "a2", sameSubject: true },
      { referenceSampleId: "a1", probeSampleId: "b1", sameSubject: false },
    ],
    thresholds: [threshold],
  });

  const point = report.verification.operatingPoints[0];
  assert.equal(point.fmr, expected.fmr);
  assert.equal(point.fnmr, expected.fnmr);
});
