import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  TRUST_FACE_SFACE_LAB_INFERENCE_V1 as PROFILE,
  inspectOpenCvSFaceArtifactV1,
  normalizeSFaceFaceBoxV1,
  runOpenCvSFaceLabInferenceV1,
} from "../src/sface-lab-inference-v1.mjs";

test("pins the OpenCV Zoo SFace artifact and remains lab-only", () => {
  assert.equal(PROFILE.sourceRevision, "47534e27c9851bb1128ccc0102f1145e27f23f98");
  assert.equal(PROFILE.weightsDigest, "sha256:0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79");
  assert.equal(PROFILE.artifactBytes, 38696353);
  assert.equal(PROFILE.embeddingDim, 512);
  assert.equal(PROFILE.alignmentLandmarks, 5);
  assert.equal(PROFILE.autoDownload, false);
  assert.equal(PROFILE.productionReady, false);
  assert.equal(PROFILE.biometricClaimReady, false);
});

test("normalizes YuNet/SFace face boxes to bbox + five landmarks", () => {
  const faceBox = normalizeSFaceFaceBoxV1([
    10, 20, 100, 120,
    35, 55,
    75, 55,
    55, 80,
    40, 105,
    70, 105,
    0.99,
  ]);
  assert.equal(faceBox.length, 14);
  assert.deepEqual(faceBox.slice(4), [35, 55, 75, 55, 55, 80, 40, 105, 70, 105]);
});

test("rejects malformed landmark payloads", () => {
  assert.throws(
    () => normalizeSFaceFaceBoxV1([0, 0, 10, 10, 1, 2]),
    (error) => error.code === "invalid_face_box",
  );
  assert.throws(
    () => normalizeSFaceFaceBoxV1([0, 0, 0, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    (error) => error.code === "invalid_face_box",
  );
});

test("artifact inspection is fail-closed on a non-pinned file", async () => {
  const path = join(tmpdir(), `trust-face-sface-mismatch-${process.pid}-${Date.now()}.onnx`);
  try {
    await writeFile(path, "not-the-sface-model");
    const inspection = await inspectOpenCvSFaceArtifactV1({ modelPath: path });
    assert.equal(inspection.sourceIntegrityVerified, false);
    assert.equal(inspection.digestMatches, false);
    assert.equal(inspection.sizeMatches, false);
    assert.equal(inspection.productionReady, false);
  } finally {
    await rm(path, { force: true });
  }
});

test("runtime refuses to spawn when the model digest is wrong", async () => {
  const modelPath = join(tmpdir(), `trust-face-sface-model-${process.pid}-${Date.now()}.onnx`);
  const imagePath = join(tmpdir(), `trust-face-sface-image-${process.pid}-${Date.now()}.jpg`);
  let spawned = false;
  try {
    await writeFile(modelPath, "wrong-model");
    await writeFile(imagePath, "not-even-decoded-because-integrity-fails-first");

    await assert.rejects(
      () =>
        runOpenCvSFaceLabInferenceV1({
          modelPath,
          imagePath,
          faceBox: [0, 0, 10, 10, 2, 2, 8, 2, 5, 5, 3, 8, 7, 8],
          runner: () => {
            spawned = true;
            return { status: 0, stdout: "{}" };
          },
        }),
      (error) => error.code === "sface_source_integrity_mismatch",
    );
    assert.equal(spawned, false);
  } finally {
    await rm(modelPath, { force: true });
    await rm(imagePath, { force: true });
  }
});
