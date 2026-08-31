import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CONSENTED_REAL_EVAL_AUTH_GATE_V1,
  createConsentedRealEvaluationAuthorization,
  assertConsentedRealEvaluationAuthorization,
} from "../src/consented-real-eval-auth-gate-v1.mjs";

const digest = (char) => `sha256:${char.repeat(64)}`;
const commit = "cb7bf0db85e730802d4cd64cc14ce519c35ee9be";

function auth() {
  return createConsentedRealEvaluationAuthorization({
    authorizationId: "eval-auth-001",
    scope: "face-1to1-evaluation",
    protocolDigest: digest("a"),
    codeCommit: commit,
    issuedAt: "2026-08-31T10:00:00Z",
    expiresAt: "2026-08-31T14:00:00Z",
    evaluationOnly: true,
    trainingAuthorized: false,
    realBiometricEvaluationAuthorized: true,
  });
}

test("profile is evaluation-only and non-production", () => {
  assert.equal(TRUST_FACE_CONSENTED_REAL_EVAL_AUTH_GATE_V1.requiredScope, "face-1to1-evaluation");
  assert.equal(TRUST_FACE_CONSENTED_REAL_EVAL_AUTH_GATE_V1.trainingAuthorizedByThisGate, false);
  assert.equal(TRUST_FACE_CONSENTED_REAL_EVAL_AUTH_GATE_V1.realEvaluationAuthorizedByDefault, false);
  assert.equal(TRUST_FACE_CONSENTED_REAL_EVAL_AUTH_GATE_V1.productionReady, false);
});

test("creates deterministic evaluation-only authorization", () => {
  const a = auth();
  const b = auth();
  assert.deepEqual(a, b);
  assert.match(a.authorizationDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a.trainingAuthorized, false);
  assert.equal(a.realBiometricEvaluationAuthorized, true);
  assert.equal(a.rawBiometricPayloadAccepted, false);
  assert.equal(a.rawEmbeddingAccepted, false);
});

test("cannot be used to authorize biometric training", () => {
  assert.throws(
    () => createConsentedRealEvaluationAuthorization({
      authorizationId: "eval-auth-002",
      scope: "face-1to1-evaluation",
      protocolDigest: digest("b"),
      codeCommit: commit,
      issuedAt: "2026-08-31T10:00:00Z",
      expiresAt: "2026-08-31T14:00:00Z",
      evaluationOnly: true,
      trainingAuthorized: true,
      realBiometricEvaluationAuthorized: true,
    }),
    (error) => error?.code === "training_authorization_forbidden",
  );
});

test("requires explicit real evaluation authorization", () => {
  assert.throws(
    () => createConsentedRealEvaluationAuthorization({
      authorizationId: "eval-auth-003",
      scope: "face-1to1-evaluation",
      protocolDigest: digest("c"),
      codeCommit: commit,
      issuedAt: "2026-08-31T10:00:00Z",
      expiresAt: "2026-08-31T14:00:00Z",
      evaluationOnly: true,
      trainingAuthorized: false,
      realBiometricEvaluationAuthorized: false,
    }),
    (error) => error?.code === "real_biometric_evaluation_not_authorized",
  );
});

test("asserts active authorization against protocol digest and commit", () => {
  const result = assertConsentedRealEvaluationAuthorization({
    authorization: auth(),
    protocolDigest: digest("a"),
    codeCommit: commit,
    now: "2026-08-31T12:00:00Z",
  });
  assert.equal(result.authorized, true);
  assert.equal(result.trainingAuthorized, false);
  assert.equal(result.realBiometricEvaluationAuthorized, true);
});

test("rejects expired, mismatched protocol, and mismatched commit", () => {
  assert.throws(
    () => assertConsentedRealEvaluationAuthorization({
      authorization: auth(),
      protocolDigest: digest("a"),
      codeCommit: commit,
      now: "2026-08-31T14:00:00Z",
    }),
    (error) => error?.code === "authorization_not_active",
  );

  assert.throws(
    () => assertConsentedRealEvaluationAuthorization({
      authorization: auth(),
      protocolDigest: digest("d"),
      codeCommit: commit,
      now: "2026-08-31T12:00:00Z",
    }),
    (error) => error?.code === "protocol_digest_mismatch",
  );

  assert.throws(
    () => assertConsentedRealEvaluationAuthorization({
      authorization: auth(),
      protocolDigest: digest("a"),
      codeCommit: "different-commit",
      now: "2026-08-31T12:00:00Z",
    }),
    (error) => error?.code === "code_commit_mismatch",
   );
});
