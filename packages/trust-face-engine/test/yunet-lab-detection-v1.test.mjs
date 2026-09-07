import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  TRUST_FACE_YUNET_LAB_DETECTION_V1 as PROFILE,
  inspectOpenCvYuNetArtifactV1,
  normalizeYuNetFaceBoxV1,
  parseYuNetRuntimeResultV1,
  runOpenCvYuNetLabDetectionV1,
} from "../src/yunet-lab-detection-v1.mjs";

const sampleFace = [
  10, 20, 100, 120,
  35, 55,
  75, 55,
  55, 80,
  40, 105,
  70, 105,
  0.97,
];

test("pins YuNet 2023mar and remains lab-only", () => {
  assert.equal(PROFILE.sourceRevision, "47534e27c9851bb1128ccc0102f1145e27f23f98");
  assert.equal(PROFILE.weightsDigest, "sha256:8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4");
  assert.equal(PROFILE.artifactBytes, 232589);
  assert.equal(PROFILE.alignmentLandmarks, 5);
  assert.equal(PROFILE.autoDownload, false);
  assert.equal(PROFILE.productionReady, false);
  assert.equal(PROFILE.biometricClaimReady, false);
});

test("normalizes a valid YuNet face row", () => {
  const normalized = normalizeYuNetFaceBoxV1(sampleFace);
  assert.equal(normalized.length, 15);
  assert.equal(normalized[14], 0.97);
});

test("rejects invalid YuNet rows", () => {
  assert.throws(
    () => normalizeYuNetFaceBoxV1(sampleFace.slice(0, 14)),
    (error) => error.code === "invalid_yunet_face_box",
  );
  assert.throws(
    () => normalizeYuNetFaceBoxV1([...sampleFace.slice(0, 14), 1.2]),
    (error) => error.code === "invalid_yunet_face_box",
  );
});

test("parses runtime output without storing biometric payload", () => {
  const result = parseYuNetRuntimeResultV1({
    stdout: JSON.stringify({
      cvVersion: "4.13.0",
      detectionCount: 2,
      faceBox: sampleFace,
    }),
  });
  assert.equal(result.detectionCount, 2);
  assert.equal(result.selectedScore, 0.97);
  assert.equal(result.rawBiometricPayloadStored, false);
  assert.equal(result.productionReady, false);
});

test("artifact inspection is fail-closed on a non-pinned file", async () => {
  const path = join(tmpdir(), `trust-face-yunet-mismatch-${process.pid}-${Date.now()}.onnx`);
  try {
    await writeFile(path, "not-yunet");
    const inspection = await inspectOpenCvYuNetArtifactV1({ modelPath: path });
    assert.equal(inspection.sourceIntegrityVerified, false);
    assert.equal(inspection.digestMatches, false);
    assert.equal(inspection.sizeMatches, false);
  } finally {
    await rm(path, { force: true });
  }
});

test("runtime refuses to spawn before YuNet integrity passes", async () => {
  const modelPath = join(tmpdir(), `trust-face-yunet-model-${process.pid}-${Date.now()}.onnx`);
  const imagePath = join(tmpdir(), `trust-face-yunet-image-${process.pid}-${Date.now()}.jpg`);
  let spawned = false;
  try {
    await writeFile(modelPath, "wrong-model");
    await writeFile(imagePath, "not-decoded-because-integrity-fails-first");
    await assert.rejects(
      () => runOpenCvYuNetLabDetectionV1( {
        modelPath,
        imagePath,
        runner: () => {
          spawned = true;
          return { status: 0, stdout: "{}" };
        },
      }),
      (error) => error.code === "yunet_source_integrity_mismatch",
    );
    assert.equal(spawned, false);
  } finally {
    await rm(modelPath, { force: true });
    await rm(imagePath, { force: true });
  }
});
