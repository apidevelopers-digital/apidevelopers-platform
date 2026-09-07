import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.resolve(here, "../scripts");
const executor = fs.readFileSync(path.join(scripts, "run-local-pilot-consented-camera-v1.py"), "utf8");
const launcher = fs.readFileSync(path.join(scripts, "run-local-pilot-consented-camera-v1.sh"), "utf8");

test("consented camera gate is explicit and local-only", () => {
  assert.match(executor, /IGOR_APROVA_CAMERA_LOCAL/);
  assert.match(executor, /GITHUB_ACTIONS/);
  assert.match(executor, /github_actions_camera_forbidden/);
  assert.match(launcher, /TRUST_FACE_LOCAL_CAMERA_CONFIRM/);
  assert.match(launcher, /uname -s/);
});

test("camera frame and biometric vector are never persisted or emitted", () => {
  assert.equal(executor.includes("cv2.imwrite"), false);
  assert.equal(executor.includes("np.save"), false);
  assert.equal(executor.includes("embeddingValues"), false);
  assert.equal(executor.includes('"embeddingPersisted": False'), true);
  assert.equal(executor.includes('"embeddingLogged": False'), true);
  assert.equal(executor.includes('"outputVectorExposed": False'), true);
  assert.equal(executor.includes('"rawImagePersisted": False'), true);
  assert.equal(executor.includes('"rawImageLogged": False'), true);
});

test("camera gate forbids matching, threshold, identity and production claims", () => {
  for (const expected of [
    '"benchmarkExecuted": False',
    '"thresholdApplied": False',
    '"cosineComputed": False',
    '"matchedClaimed": False',
    '"identityClaimed": False',
    '"calibrationMutationPerformed": False',
    '"productionAuthorized": False',
    '"productionReady": False',
  ]) {
    assert.equal(executor.includes(expected), true, expected);
  }
});

test("models are pinned by exact bytes and sha256", () => {
  assert.match(executor, /260_694_151/);
  assert.match(executor, /232_589/);
  assert.match(executor, /a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60/);
  assert.match(executor, /8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4/);
});
