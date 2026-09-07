import assert from "node:assert/strict";
import test from "node:test";

import { TRUST_FACE_YUNET_LAB_DETECTION_V1 as PROFILE } from "../src/yunet-lab-detection-v1.mjs";

test("pins the observed YuNet laboratory score threshold", () => {
  assert.equal(PROFILE.scoreThreshold, 0.7);
  assert.equal(PROFILE.productionAuthorized, false);
  assert.equal(PROFILE.productionReady, false);
  assert.equal(PROFILE.biometricClaimReady, false);
});
