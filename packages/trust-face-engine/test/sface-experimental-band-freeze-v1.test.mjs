import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1,
  admitIndependentSFaceEvidenceV1,
  assertFrozenExperimentalSFaceBandV1,
  fingerprintExperimentalSFaceBandV1,
} from "../src/sface-experimental-band-freeze-v1.mjs";
import { TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1 } from "../src/sface-experimental-threshold-band-v1.mjs";

test("pins the experimental band fingerprint", () => {
  assert.equal(
    fingerprintExperimentalSFaceBandV1(TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1),
    TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.frozenProfileSha256,
  );
  const result = assertFrozenExperimentalSFaceBandV1(TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1);
  assert.equal(result.frozen, true);
  assert.equal(result.rederivationAllowed, false);
  assert.equal(result.calibrationMutationAllowed, false);
  assert.equal(result.thresholdCalibrated, false);
  assert.equal(result.productionReady, false);
  assert.equal(result.biometricClaimReady, false);
});

test("fails closed on silent band mutation", () => {
  assert.throws(
    () => assertFrozenExperimentalSFaceBandV1({
      ...TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1,
      highSimilarityMin: TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1.highSimilarityMin + 0.001,
    }),
    /freeze mismatch/,
  );
});

test("rejects derivation reuse, identity overlap, and public web scrape", () => {
  const base = {
    independentFromEvidenceIds: [TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.derivationEvidenceId],
    admissibilityEvidence: "explicit-consent-record",
  };
  assert.throws(
    () => admitIndependentSFaceEvidenceV1({
      ...base,
      evidenceId: TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.derivationEvidenceId,
      evidenceKind: "consented_new_collection",
      identityOverlapWithDerivation: false,
    }),
    /must not reuse/,
  );
  assert.throws(
    () => admitIndependentSFaceEvidenceV1({
      ...base,
      evidenceId: "candidate-v1",
      evidenceKind: "consented_new_collection",
      identityOverlapWithDerivation: true,
    }),
    /identityOverlapWithDerivation/,
  );
  assert.throws(
    () => admitIndependentSFaceEvidenceV1({
      ...base,
      evidenceId: "public-celebrity-images-v1",
      evidenceKind: "public_web_scrape",
      identityOverlapWithDerivation: false,
    }),
    /not admissible/,
  );
});

test("admits new consented evidence only as benchmark-only evidence", () => {
  const result = admitIndependentSFaceEvidenceV1({
    evidenceId: "consented-independent-session-v1",
    evidenceKind: "consented_new_collection",
    independentFromEvidenceIds: [TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.derivationEvidenceId],
    identityOverlapWithDerivation: false,
    admissibilityEvidence: "explicit-consent-record-v1",
  });
  assert.equal(result.admitted, true);
  assert.equal(result.independentFromFrozenDerivation, true);
  assert.equal(result.benchmarkOnly, true);
  assert.equal(result.bandFrozen, true);
  assert.equal(result.calibrationMutationAllowed, false);
  assert.equal(result.thresholdCalibrated, false);
  assert.equal(result.productionReady, false);
  assert.equal(result.biometricClaimReady, false);
});
