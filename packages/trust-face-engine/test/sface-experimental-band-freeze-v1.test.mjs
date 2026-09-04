import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1,
  admitIndependentSFaceEvidenceV1,
  assertFrozenExperimentalSFaceBandV1,
  fingerprintExperimentalSFaceBandV1,
} from "../src/sface-experimental-band-freeze-v1.mjs";
import {
  TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1,
} from "../src/sface-experimental-threshold-band-v1.mjs";

test("pins the current experimental SFace band to the frozen canonical fingerprint", () => {
  const fingerprint = fingerprintExperimentalSFaceBandV1(
    TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1,
  );

  assert.equal(
    fingerprint,
    TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.frozenProfileSha256,
  );

  const freeze = assertFrozenExperimentalSFaceBandV1(\n    TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1,\n  );

  assert.equal(freeze.frozen, true);
  assert.equal(freeze.rederivationAllowed, false);
  assert.equal(freeze.independentEvidenceRequired, true);
  assert.equal(freeze.calibrationMutationAllowed, false);
  assert.equal(freeze.thresholdCalibrated, false);
  assert.equal(freeze.productionReady, false);
  assert.equal(freeze.biometricClaimReady, false);
});

test("fails closed when the frozen band values are silently changed", () => {
  assert.throws(
    () =>
      assertFrozenExperimentalSFaceBandV1({
        ...TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1,
        highSimilarityMin:
          TRUST_FACE_SFACE_EXPERIMENTAL_BAND_V1.highSimilarityMin + 0.001,
      }),
    /freeze mismatch/,
  );
});

test("rejects reuse of the derivation evidence as independent evidence", () => {
  assert.throws(
    () =>
      admitIndependentSFaceEvidenceV1({
        evidenceId:
          TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.derivationEvidenceId,
        evidenceKind: "consented_new_collection",
        independentFromEvidenceIds: [
          TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.derivationEvidenceId,
        ],
        identityOverlapWithDerivation: false,
        admissibilityEvidence: "explicit-consent-record",
      }),
    /must not reuse the derivation evidence id/,
  );
});

test("rejects identity overlap with the frozen derivation set", () => {
  assert.throws(
    () =>
      admitIndependentSFaceEvidenceV1({
        evidenceId: "independent-candidate-v1",
        evidenceKind: "consented_new_collection",
        independentFromEvidenceIds: [
          TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.derivationEvidenceId,
        ],
        identityOverlapWithDerivation: true,
        admissibilityEvidence: "explicit-consent-record",
      }),
    /identityOverlapWithDerivation/,
  );
});

test("rejects arbitrary or unapproved evidence kinds", () => {
  assert.throws(
    () =>
      admitIndependentSFaceEvidenceV1({
        evidenceId: "public-celebrity-images-v1",
        evidenceKind: "public_web_scrape",
        independentFromEvidenceIds: [
          TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.derivationEvidenceId,
        ],
        identityOverlapWithDerivation: false,
        admissibilityEvidence: "publicly-visible-only",
      }),
    /not admissible/,
  );
});

test("admits new consented evidence only as benchmark evidence without calibration mutation", () => {
  const result = admitIndependentSFaceEvidenceV1({
    evidenceId: "consented-independent-session-v1",
    evidenceKind: "consented_new_collection",
    independentFromEvidenceIds: [
      TRUST_FACE_SFACE_EXPERIMENTAL_BAND_FREEZE_V1.derivationEvidenceId,
    ],
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
