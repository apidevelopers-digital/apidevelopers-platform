import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.resolve(here, "../scripts");
const executor = fs.readFileSync(path.join(scripts, "run-local-pilot-consented-1to1-v1.py"), "utf8");
const launcher = fs.readFileSync(path.join(scripts, "run-local-pilot-consented-1to1-v1.sh"), "utf8");

test("1:1 launcher requires explicit confirmation, local macOS and enabled kill-switch state", () => {
  assert.match(launcher, /IGOR_APROVA_1TO1_LOCAL/);
  assert.match(launcher, /GITHUB_ACTIONS/);
  assert.match(launcher, /uname -s/);
  assert.match(launcher, /trust-face-pilot-control-v1\.sh/);
  assert.match(launcher, /"state":"enabled"/);
});

test("1:1 executor emits score only and never a biometric decision", () => {
  assert.match(executor, /"scoreType": "cosine_similarity"/);
  assert.match(executor, /"scoreObserved": round\(score, 6\)/);
  assert.match(executor, /"thresholdApplied": False/);
  assert.match(executor, /"decisionEmitted": False/);
  assert.match(executor, /"matchedClaimed": False/);
  assert.match(executor, /"identityClaimed": False/);
  assert.match(executor, /"productionAuthorized": False/);
  assert.match(executor, /"productionReady": False/);
});

test("1:1 executor does not persist images or embeddings and zeroizes in-memory vectors", () => {
  assert.equal(executor.includes("cv2.imwrite"), false);
  assert.equal(executor.includes("np.save"), false);
  assert.equal(executor.includes("pickle"), false);
  assert.match(executor, /enrollment\.fill\(0\.0\)/);
  assert.match(executor, /probe\.fill\(0\.0\)/);
  assert.match(executor, /"rawImagePersisted": False/);
  assert.match(executor, /"embeddingPersisted": False/);
  assert.match(executor, /"embeddingLogged": False/);
  assert.match(executor, /"outputVectorExposed": False/);
});

test("1:1 executor requires two separate consented captures and no PAD claim", () => {
  assert.match(executor, /Enrollment capture/);
  assert.match(executor, /press Enter for the probe capture/);
  assert.match(executor, /Probe capture/);
  assert.match(executor, /"livenessEvaluated": False/);
  assert.match(executor, /"padEvaluated": False/);
});
