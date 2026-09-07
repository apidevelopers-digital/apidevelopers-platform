import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CONTROLLED_PILOT_V0_READINESS_V1,
  computeTrustFaceControlledPilotV0ReadinessV1,
} from "../src/controlled-pilot-v0-readiness-v1.mjs";

const expectedGateIds = [
  "auraface_512d_runtime",
  "synthetic_face_pipeline",
  "local_pilot_interface",
  "consented_1to1_pilot",
  "privacy_fail_closed",
  "pilot_liveness_pad_boundary",
  "operator_runbook_kill_switch",
];

test("readiness helper uses the canonical Controlled Pilot v0 gate ids", () => {
  assert.deepEqual(
    TRUST_FACE_CONTROLLED_PILOT_V0_READINESS_V1.gates.map((gate) => gate.id),
    expectedGateIds,
  );
});

test("canonical gate evidence computes the documented 100 percent", () => {
  const evidence = Object.fromEntries(expectedGateIds.map((id) => [id, true]));
  const readiness = computeTrustFaceControlledPilotV0ReadinessV1(evidence);
  assert.equal(readiness.percent, 100);
  assert.equal(readiness.complete, true);
  assert.equal(readiness.productionReady, false);
  assert.equal(readiness.authoritativeDecisionAllowed, false);
});
