import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CONTROLLED_PILOT_V0_READINESS_V1,
  computeTrustFaceControlledPilotV0ReadinessV1,
} from "../src/controlled-pilot-v0-readiness-v1.mjs";

test("controlled-pilot readiness weights sum to exactly 100", () => {
  assert.equal(
    TRUST_FACE_CONTROLLED_PILOT_V0_READINESS_V1.gates.reduce((sum, gate) => sum + gate.weight, 0),
    100,
  );
});

test("controlled-pilot readiness is evidence based and never production equivalent", () => {
  const readiness = computeTrustFaceControlledPilotV0ReadinessV1({
    auraface_512d_runtime: true,
    privacy_fail_closed: true,
  });

  assert.equal(readiness.percent, 25);
  assert.equal(readiness.complete, false);
  assert.equal(readiness.productionEquivalent, false);
  assert.equal(readiness.productionReady, false);
  assert.equal(readiness.biometricCertificationClaim, false);
  assert.equal(readiness.authoritativeDecisionAllowed, false);
});

test("100 percent means controlled pilot only, not production", () => {
  const all = Object.fromEntries(
    TRUST_FACE_CONTROLLED_PILOT_V0_READINESS_V1.gates.map((gate) => [gate.id, true]),
  );
  const readiness = computeTrustFaceControlledPilotV0ReadinessV1(all);

  assert.equal(readiness.percent, 100);
  assert.equal(readiness.complete, true);
  assert.equal(readiness.productionEquivalent, false);
  assert.equal(readiness.productionReady, false);
  assert.equal(readiness.authoritativeDecisionAllowed, false);
});
