import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CONTROLLED_PILOT_LIVENESS_PAD_BOUNDARY_V1 as POLICY,
  createControlledPilotLivenessPadBoundaryV1,
  assertControlledPilotLivenessPadBoundaryV1,
} from "../src/controlled-pilot-liveness-pad-boundary-v1.mjs";

test("PAD boundary is boundary-only and never authorizes a biometric decision", () => {
  assert.equal(POLICY.mode, "boundary-only");
  for (const field of [
    "rawImageAccepted",
    "rawVideoAccepted",
    "rawEmbeddingAccepted",
    "activeChallengeAuthorized",
    "livenessEvaluationAuthorized",
    "padEvaluationAuthorized",
    "thresholdAuthorized",
    "liveSpoofDecisionAuthorized",
    "highAssurancePadClaimAuthorized",
    "identityDecisionAuthorized",
    "productionAuthorized",
    "productionReady",
  ]) assert.equal(POLICY[field], false, field);
});

test("sanitized laboratory metadata stays non-authoritative", () => {
  const receipt = createControlledPilotLivenessPadBoundaryV1({
    source: "liveness-pad-lab-v1",
    evidenceDigest: `sha256:${"a".repeat(64)}`,
    labSignalObserved: true,
    notes: "derived-signal laboratory evidence only",
  });
  assert.equal(receipt.boundaryOnly, true);
  assert.equal(receipt.livenessEvaluated, false);
  assert.equal(receipt.padEvaluated, false);
  assert.equal(receipt.thresholdApplied, false);
  assert.equal(receipt.liveSpoofDecisionEmitted, false);
  assert.equal(receipt.highAssurancePadClaimed, false);
  assert.equal(receipt.identityDecisionEmitted, false);
  assert.equal(receipt.productionAuthorized, false);
  assert.deepEqual(assertControlledPilotLivenessPadBoundaryV1(receipt), {
    valid: true,
    version: "trust-face-controlled-pilot-liveness-pad-boundary/v1",
    boundaryOnly: true,
    livenessEvaluated: false,
    padEvaluated: false,
    productionAuthorized: false,
  });
});

test("raw biometric payloads and PAD decisions fail closed", () => {
  for (const [field, value, code] of [
    ["image", [1, 2, 3], "raw_pad_payload_forbidden"],
    ["video", "bytes", "raw_pad_payload_forbidden"],
    ["embedding", [0.1], "raw_pad_payload_forbidden"],
    ["padScore", 0.9, "pad_decision_payload_forbidden"],
    ["threshold", 0.5, "pad_decision_payload_forbidden"],
    ["live", true, "pad_decision_payload_forbidden"],
    ["identity", "person-1", "pad_decision_payload_forbidden"],
  ]) {
    assert.throws(
      () => createControlledPilotLivenessPadBoundaryV1({ [field]: value }),
      (error) => error?.code === code,
      field,
    );
  }
});

test("assertion rejects any authorization drift", () => {
  const receipt = createControlledPilotLivenessPadBoundaryV1();
  for (const field of [
    "livenessEvaluated",
    "padEvaluated",
    "activeChallengeExecuted",
    "thresholdApplied",
    "liveSpoofDecisionEmitted",
    "highAssurancePadClaimed",
    "identityDecisionEmitted",
    "productionAuthorized",
    "productionReady",
  ]) {
    assert.throws(
      () => assertControlledPilotLivenessPadBoundaryV1({ ...receipt, [field]: true }),
      (error) => error?.code === "boundary_policy_violation",
      field,
    );
  }
});
