import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CONTROLLED_PILOT_LIVENESS_PAD_BOUNDARY_V1 as POLICY,
  createControlledPilotLivenessPadBoundaryV1,
  assertControlledPilotLivenessPadBoundaryV1,
} from "../src/controlled-pilot-liveness-pad-boundary-v1.mjs";

test("published boundary is fail-closed and non-authoritative", () => {
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
  ]) {
    assert.equal(POLICY[field], false, field);
  }
});

test("sanitized lab evidence may be referenced without becoming a PAD decision", () => {
  const receipt = createControlledPilotLivenessPadBoundaryV1({
    source: "liveness-pad-lab-v1",
    evidenceDigest: `sha256:${"a".repeat(64)}`,
    labSignalObserved: true,
    notes: "derived-signal laboratory evidence only",
  });

  assert.equal(receipt.boundaryOnly, true);
  assert.equal(receipt.labSignalObserved, true);
  assert.equal(receipt.livenessEvaluated, false);
  assert.equal(receipt.padEvaluated, false);
  assert.equal(receipt.thresholdApplied, false);
  assert.equal(receipt.liveSpoofDecisionEmitted, false);
  assert.equal(receipt.highAssurancePadClaimed, false);
  assert.equal(receipt.identityDecisionEmitted, false);
  assert.equal(receipt.productionAuthorized, false);

  const checked = assertControlledPilotLivenessPadBoundaryV1(receipt);
  assert.equal(checked.valid, true);
  assert.equal(checked.padEvaluated, false);
});

test("raw biometric payloads are rejected", () => {
  for (const field of ["image", "video", "frames", "embedding", "biometricTemplate"]) {
    assert.throws(
      () => createControlledPilotLivenessPadBoundaryV1({ [field]: [1, 2, 3] }),
      (error) => error?.code === "raw_pad_payload_forbidden",
      field,
    );
  }
});

test("scores thresholds and live/spoof decisions are rejected", () => {
  for (const [field, value] of [
    ["padScore", 0.9],
    ["livenessScore", 0.9],
    ["threshold", 0.5],
    ["live", true],
    ["spoof", false],
    ["decision", "live"],
    ["padDecision", "pass"],
    ["presentationAttackDetected", false],
    ["identity", "person-1"],
  ]) {
    assert.throws(
      () => createControlledPilotLivenessPadBoundaryV1({ [field]: value }),
      (error) => error?.code === "pad_decision_payload_forbidden",
      field,
    );
  }
});

test("boundary assertion fails closed on any authorization drift", () => {
  const receipt = createControlledPilotLivenessPadBoundaryV1({
    source: "liveness-pad-lab-v1",
    labSignalObserved: false,
  });

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
