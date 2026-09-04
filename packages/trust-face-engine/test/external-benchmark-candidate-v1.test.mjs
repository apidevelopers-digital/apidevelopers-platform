import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CONTROLFACE10K_CANDIDATE_V1,
  assessExternalBenchmarkCandidateV1,
  assertExternalBenchmarkReadyV1,
} from "../src/external-benchmark-candidate-v1.mjs";

test("pins official ControlFace10K archive digest and keeps execution blocked until local verification", () => {
  const result = assessExternalBenchmarkCandidateV1(
    TRUST_FACE_CONTROLFACE10K_CANDIDATE_V1,
  );

  assert.equal(
    result.sourceArchiveExpectedSha256,
    "d0ed28b3271a75ac5bb8e6799fdfe78ba3a91fb7eddecf19d960ed18fe00a108",
  );
  assert.equal(result.sourceArchiveExpectedBytes, 3137641968);
  assert.equal(result.admissibleCandidate, true);
  assert.equal(result.artifactMaterialized, false);
  assert.equal(result.artifactDigestVerified, false);
  assert.equal(result.benchmarkExecutionAuthorized, false);
  assert.equal(result.benchmarkOnly, true);
  assert.equal(result.bandFrozen, true);
  assert.equal(result.calibrationMutationAllowed, false);
  assert.equal(result.productionReady, false);
  assert.equal(result.biometricClaimReady, false);
});

test("rejects public-web-scrape evidence", () => {
  assert.throws(
    () =>
      assessExternalBenchmarkCandidateV1({
        ...TRUST_FACE_CONTROLFACE10K_CANDIDATE_V1,
        sourceType: "public_web_scrape",
        publicWebScrape: true,
      }),
    /not admissible|public web scrape/,
  );
});

test("rejects identity overlap with the frozen derivation set", () => {
  assert.throws(
    () =>
      assessExternalBenchmarkCandidateV1({
        ...TRUST_FACE_CONTROLFACE10K_CANDIDATE_V1,
        identityOverlapWithDerivation: true,
      }),
    /identity overlap/,
  );
});

test("fails closed before the external archive is materialized and hashed", () => {
  assert.throws(
    () => assertExternalBenchmarkReadyV1(TRUST_FACE_CONTROLFACE10K_CANDIDATE_V1),
    /materialize the pinned artifact/,
  );
});

test("rejects a locally materialized archive with wrong digest", () => {
  assert.throws(
    () =>
      assertExternalBenchmarkReadyV1({
        ...TRUST_FACE_CONTROLFACE10K_CANDIDATE_V1,
        artifactMaterialized: true,
        artifactDigestVerified: true,
        artifactSha256:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        artifactBytes: 3137641968,
      }),
    /does not match pinned source digest/,
  );
});

test("rejects a locally materialized archive with wrong byte size", () => {
  assert.throws(
    () =>
      assertExternalBenchmarkReadyV1({
        ...TRUST_FACE_CONTROLFACE10K_CANDIDATE_V1,
        artifactMaterialized: true,
        artifactDigestVerified: true,
        artifactSha256:
          "d0ed28b3271a75ac5bb8e6799fdfe78ba3a91fb7eddecf19d960ed18fe00a108",
        artifactBytes: 3137641967,
      }),
    /byte size does not match/,
  );
});

test("permits benchmark execution only after exact local SHA-256 and byte-size verification", () => {
  const ready = assertExternalBenchmarkReadyV1({
    ...TRUST_FACE_CONTROLFACE10K_CANDIDATE_V1,
    artifactMaterialized: true,
    artifactDigestVerified: true,
    artifactSha256:
      "d0ed28b3271a75ac5bb8e6799fdfe78ba3a91fb7eddecf19d960ed18fe00a108",
    artifactBytes: 3137641968,
  });

  assert.equal(ready.benchmarkExecutionAuthorized, true);
  assert.equal(ready.benchmarkOnly, true);
  assert.equal(ready.bandFrozen, true);
  assert.equal(ready.calibrationMutationAllowed, false);
  assert.equal(ready.thresholdCalibrated, false);
  assert.equal(ready.productionReady, false);
  assert.equal(ready.biometricClaimReady, false);
});
