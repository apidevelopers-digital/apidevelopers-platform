import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTROLLED_PILOT_PRIVACY_FAIL_CLOSED_V1,
  assertControlledPilotPrivacyFailClosedV1,
} from "../src/controlled-pilot-privacy-fail-closed-v1.mjs";

test("privacy contract is local-only and denies biometric persistence/transport", () => {
  assert.equal(CONTROLLED_PILOT_PRIVACY_FAIL_CLOSED_V1.localOnly, true);
  for (const key of [
    "rawBiometricNetworkTransportAllowed","githubActionsBiometricTransportAllowed",
    "rawImagePersistenceAllowed","alignedCropPersistenceAllowed",
    "embeddingPersistenceAllowed","embeddingLoggingAllowed","outputVectorExposureAllowed",
    "thresholdAllowed","identityClaimAllowed","productionAllowed",
  ]) assert.equal(CONTROLLED_PILOT_PRIVACY_FAIL_CLOSED_V1[key], false, key);
});

test("sanitized operational event passes", () => {
  const out = assertControlledPilotPrivacyFailClosedV1({
    localOnly: true,
    executionCompleted: true,
    syntheticInputOnly: true,
    networkBiometricTransport: false,
    githubActionsBiometricTransport: false,
    rawImagePersisted: false,
    alignedCropPersisted: false,
    embeddingPersisted: false,
    embeddingLogged: false,
    outputVectorExposed: false,
    thresholdApplied: false,
    identityClaimed: false,
    productionAuthorized: false,
  });
  assert.equal(out.executionCompleted, true);
  assert.equal(out.embeddingPersisted, false);
});

test("sensitive fields fail closed", () => {
  for (const patch of [
    { path: "/private/input.jpg" },
    { embedding: [0.1, 0.2] },
    { rawImage: "bytes" },
    { cosine: 0.9 },
  ]) {
    assert.throws(
      () => assertControlledPilotPrivacyFailClosedV1(patch),
      (e) => e?.code === "privacy_sensitive_field_forbidden",
    );
  }
});

test("forbidden execution flags fail closed", () => {
  for (const key of [
    "networkBiometricTransport","githubActionsBiometricTransport","rawImagePersisted",
    "alignedCropPersisted","embeddingPersisted","embeddingLogged","outputVectorExposed",
    "thresholdApplied","identityClaimed","productionAuthorized",
  ]) {
    assert.throws(
      () => assertControlledPilotPrivacyFailClosedV1({ [key]: true }),
      (e) => e?.code === "privacy_fail_closed_violation",
    );
  }
});
