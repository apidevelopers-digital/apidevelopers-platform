import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_CONTROLFACE10K_SUBSET_PLAN_V1,
  selectControlFace10KIdentitySubsetV1,
} from "../src/controlface10k-subset-plan-v1.mjs";

test("defines a 64-identity, 192-image benchmark-only plan", () => {
  assert.equal(TRUST_FACE_CONTROLFACE10K_SUBSET_PLAN_V1.requestedIdentityCount, 64);
  assert.equal(TRUST_FACE_CONTROLFACE10K_SUBSET_PLAN_V1.expectedImagesPerIdentity, 3);
  assert.equal(TRUST_FACE_CONTROLFACE10K_SUBSET_PLAN_V1.requestedImageCount, 192);
  assert.equal(TRUST_FACE_CONTROLFACE10K_SUBSET_PLAN_V1.demographicAttributeSelectionUsed, false);
  assert.equal(TRUST_FACE_CONTROLFACE10K_SUBSET_PLAN_V1.resultAwareSelectionUsed, false);
  assert.equal(TRUST_FACE_CONTROLFACE10K_SUBSET_PLAN_V1.bandFrozen, true);
  assert.equal(TRUST_FACE_CONTROLFACE10K_SUBSET_PLAN_V1.calibrationMutationAllowed, false);
});

test("selects identities deterministically independent of input order", () => {
  const identities = Array.from(
    { length: 80 },
    (_, index) => `controlface/group/identity-${String(index).padStart(3, "0")}`,
  );

  const a = selectControlFace10KIdentitySubsetV1(identities);
  const b = selectControlFace10KIdentitySubsetV1([...identities].reverse());

  assert.deepEqual(a.selectedIdentityPaths, b.selectedIdentityPaths);
  assert.deepEqual(a.selectedIdentityKeys, b.selectedIdentityKeys);
  assert.equal(a.selectedIdentityCount, 64);
  assert.equal(a.expectedSelectedImageCount, 192);
  assert.equal(a.resultAwareSelectionUsed, false);
  assert.equal(a.demographicAttributeSelectionUsed, false);
  assert.equal(a.bandFrozen, true);
  assert.equal(a.calibrationMutationAllowed, false);
  assert.equal(a.productionReady, false);
  assert.equal(a.biometricClaimReady, false);
});

test("normalizes path separators and removes duplicate identities", () => {
  const identities = [
    "controlface/a/identity-1",
    "./controlface/a/identity-1",
    "controlface\\a\\identity-1",
    "controlface/a/identity-2",
    "controlface/a/identity-3",
  ];

  const result = selectControlFace10KIdentitySubsetV1(identities, {
    requestedIdentityCount: 3,
  });

  assert.equal(result.availableIdentityCount, 3);
  assert.equal(result.selectedIdentityCount, 3);
});

test("fails closed when there are not enough independent identities", () => {
  assert.throws(
    () =>
      selectControlFace10KIdentitySubsetV1(
        ["controlface/a/identity-1", "controlface/a/identity-2"],
        { requestedIdentityCount: 3 },
      ),
    /not enough independent identities/,
  );
});
