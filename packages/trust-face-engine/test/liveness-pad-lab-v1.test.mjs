import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_LIVENESS_PAD_LAB_V1 as PROFILE,
  evaluateLivenessPadLab,
  createLivenessPadLabEvidence,
  assertLivenessPadLabEvidence,
} from "../src/liveness-pad-lab-v1.mjs";

const good = Object.freeze({
  temporalMotionConsistency: 0.82,
  depthConsistency: 0.79,
  textureNaturalness: 0.84,
  replayArtifactResistance: 0.9,
});

test("profile is lab-only and fail-closed", () => {
  assert.equal(PROFILE.mode, "derived-signal-lab");
  assert.equal(PROFILE.rawImageAccepted, false);
  assert.equal(PROFILE.rawVideoAccepted, false);
  assert.equal(PROFILE.rawEmbeddingAccepted, false);
  assert.equal(PROFILE.activeChallengeExecuted, false);
  assert.equal(PROFILE.originAttested, false);
  assert.equal(PROFILE.realPadReady, false);
  assert.equal(PROFILE.benchmarkReady, false);
  assert.equal(PROFILE.productionReady, false);
  assert.equal(PROFILE.biometricClaimReady, false);
});

test("evaluation is deterministic without creating a liveness decision", () => {
  const a = evaluateLivenessPadLab({ signals: good });
  const b = evaluateLivenessPadLab({ signals: good });
  assert.deepEqual(a, b);
  assert.equal(a.labSignalPassed, true);
  assert.equal(a.livenessEvaluatedInLab, true);
  assert.equal(a.livenessDecisionCreated, false);
  assert.equal(a.realPadReady, false);
});

test("critical weak signal fails closed", () => {
  const result = evaluateLivenessPadLab({ signals: { ...good, depthConsistency: 0.2 } });
  assert.equal(result.labSignalPassed, false);
  assert.ok(result.reasonCodes.includes("depthConsistency_low"));
});

test("raw image video and embedding payloads are rejected", () => {
  for (const field of ["image", "frames", "embedding"]) {
    assert.throws(
      () => evaluateLivenessPadLab({ signals: { ...good, [field]: [1, 2, 3] } }),
      (error) => error?.code === "raw_pad_payload_forbidden",
    );
  }
});

test("evidence is deterministic and digest-bound", () => {
  const input = { evidenceId: "pad-lab-001", signals: good, createdAt: "2026-08-31T20:00:00-03:00" };
  const a = createLivenessPadLabEvidence(input);
  const b = createLivenessPadLabEvidence(input);
  assert.deepEqual(a, b);
  assert.match(a.evidenceDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a.createdAt, "2026-08-31T23:00:00.000Z");
  assert.equal(a.productionReady, false);
});

test("assertion validates canonical evidence", () => {
  const evidence = createLivenessPadLabEvidence({
    evidenceId: "pad-lab-002", signals: good, createdAt: "2026-08-31T23:00:00Z",
  });
  const checked = assertLivenessPadLabEvidence({
    evidence, signals: good, now: "2026-08-31T23:10:00Z",
  });
  assert.equal(checked.valid, true);
  assert.equal(checked.evidenceDigest, evidence.evidenceDigest);
  assert.equal(checked.labSignalPassed, true);
  assert.equal(checked.realPadReady, false);
});

test("assertion rejects signal and threshold drift", () => {
  const evidence = createLivenessPadLabEvidence({
    evidenceId: "pad-lab-003", signals: good, createdAt: "2026-08-31T23:00:00Z",
  });
  assert.throws(
    () => assertLivenessPadLabEvidence({
      evidence, signals: { ...good, textureNaturalness: 0.7 }, now: "2026-08-31T23:10:00Z",
    }),
    (error) => ["pad_evidence_padScore_mismatch", "pad_evidence_signals_mismatch"].includes(error?.code),
  );
  assert.throws(
    () => assertLivenessPadLabEvidence({
      evidence,
      signals: good,
      thresholdProfile: { id: "other-threshold", padScore: 0.7 },
      now: "2026-08-31T23:10:00Z",
    }),
    (error) => [
      "pad_evidence_thresholdProfileId_mismatch",
      "pad_evidence_threshold_mismatch",
      "pad_evidence_labSignalPassed_mismatch",
    ].includes(error?.code),
  );
});

test("assertion rejects policy and digest tampering", () => {
  const evidence = createLivenessPadLabEvidence({
    evidenceId: "pad-lab-004", signals: good, createdAt: "2026-08-31T23:00:00Z",
  });
  assert.throws(
    () => assertLivenessPadLabEvidence({
      evidence: { ...evidence, productionReady: true }, signals: good, now: "2026-08-31T23:10:00Z",
    }),
    (error) => error?.code === "pad_evidence_policy_mismatch",
  );
  assert.throws(
    () => assertLivenessPadLabEvidence({
      evidence: { ...evidence, evidenceDigest: `sha2556:${"9".repeat(64)}` },
      signals: good,
      now: "2026-08-31T23:10:00Z",
    }),
    (error) => error?.code === "pad_evidence_digest_mismatch",
  );
});

test("assertion rejects future evidence", () => {
  const evidence = createLivenessPadLabEvidence({
    evidenceId: "pad-lab-005", signals: good, createdAt: "2026-08-31T23:20:00Z",
  });
  assert.throws(
    () => assertLivenessPadLabEvidence({
      evidence, signals: good, now: "2026-08-31T23:10:00Z",
    }),
    (error) => error?.code === "pad_evidence_from_future",
   );
});
