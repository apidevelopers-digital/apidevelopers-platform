import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1 as P,
  createTrustFaceProductionReadinessReviewInventory as create,
  assertTrustFaceProductionReadinessReviewInventory as verify,
} from "../src/production-readiness-review-gate-v1.mjs";

const D = (c) => `sha256:${c.repeat(64)}`;
const C = P.requiredEvidenceCategories;
const ev = (category, i, overrides = {}) => ({
  evidenceId: `e-${i + 1}`,
  category,
  artifactDigest: D((i + 1).toString(16)),
  sourceRef: `artifact://${category}`,
  assessorRef: `external-assessor://${category}`,
  assessedAt: "2026-09-02T15:00:00Z",
  status: "pass",
  evidenceEnvironment: "production",
  assessmentScope: "external-independent",
  independentAssessmentDeclared: true,
  ...overrides,
});
const all = () => C.map(ev);

test("profile requires production-classified external-independent evidence and never claims readiness", () => {
  assert.equal(P.requiredEvidenceCategories.length, 8);
  assert.equal(P.requiredEvidenceEnvironment, "production");
  assert.equal(P.requiredAssessmentScope, "external-independent");
  assert.equal(P.evidenceClassificationRequired, true);
  for (const key of [
    "evidenceAuthenticityVerified",
    "externalEvidenceVerifierIntegrated",
    "independentValidationVerified",
    "productionReady",
    "biometricClaimReady",
  ]) assert.equal(P[key], false);
});

test("incomplete evidence stays blocked", () => {
  const inventory = create({
    evidenceRecords: [ev(C[0], 0)],
    evaluatedAt: "2026-09-02T15:10:00Z",
  });
  assert.equal(inventory.reviewEligible, false);
  assert.equal(inventory.blockers.length, 7);
  assert.equal(inventory.productionReady, false);
});

test("complete correctly classified metadata is only review eligible", () => {
  const records = all();
  const inventory = create({ evidenceRecords: records, evaluatedAt: "2026-09-02T15:10:00Z" });
  assert.equal(inventory.reviewEligible, true);
  assert.equal(inventory.blockers.length, 0);
  assert.equal(inventory.reasonCode, "external-evidence-verification-still-required");
  assert.equal(inventory.evidenceAuthenticityVerified, false);
  assert.equal(inventory.independentValidationVerified, false);
  assert.equal(inventory.productionReady, false);
  assert.equal(verify({ inventory, evidenceRecords: records }).valid, true);
});

test("lab or simulation evidence cannot make the review package eligible", () => {
  const records = all().map((item) =>
    item.category === "liveness-pad" ? { ...item, evidenceEnvironment: "lab" } : item,
  );
  const inventory = create({ evidenceRecords: records, evaluatedAt: "2026-09-02T15:10:00Z" });
  assert.deepEqual(inventory.blockers, [
    { category: "liveness-pad", blocker: "evidence-environment-not-production" },
  ]);
  assert.equal(inventory.reviewEligible, false);
});

test("non-external-independent assessment scope cannot make the review package eligible", () => {
  const records = all().map((item) =>
    item.category === "production-sdk" ? { ...item, assessmentScope: "internal-lab" } : item,
  );
  const inventory = create({ evidenceRecords: records, evaluatedAt: "2026-09-02T15:10:00Z" });
  assert.deepEqual(inventory.blockers, [
    { category: "production-sdk", blocker: "assessment-scope-not-external-independent" },
  ]);
});

test("failed or undeclared independent assessment remains blocked", () => {
  const failed = all().map((item) =>
    item.category === "biometric-benchmarks" ? { ...item, status: "fail" } : item,
  );
  assert.deepEqual(
    create({ evidenceRecords: failed, evaluatedAt: "2026-09-02T15:10:00Z" }).blockers,
    [{ category: "biometric-benchmarks", blocker: "evidence-failed" }],
  );

  const undeclared = all().map((item) =>
    item.category === "face-detector" ? { ...item, independentAssessmentDeclared: false } : item,
  );
  assert.deepEqual(
    create({ evidenceRecords: undeclared, evaluatedAt: "2026-09-02T15:10:00Z" }).blockers,
    [{ category: "face-detector", blocker: "independent-assessment-not-declared" }],
  );
});

test("duplicates, unknown categories and malformed digests fail closed", () => {
  assert.throws(
    () => create({ evidenceRecords: [ev(C[0], 0), ev(C[0], 1)], evaluatedAt: "2026-09-02T15:10:00Z" }),
    (error) => error.code === "readiness_duplicate_category",
  );
  assert.throws(
    () => create({ evidenceRecords: [ev("unknown", 0)], evaluatedAt: "2026-09-02T15:10:00Z" }),
    (error) => error.code === "readiness_unknown_category",
  );
  assert.throws(
    () => create({ evidenceRecords: [ev(C[0], 0, { artifactDigest: "bad" })], evaluatedAt: "2026-09-02T15:10:00Z" }),
    (error) => error.code === "invalid_readiness_digest",
  );
});

test("tampering and sensitive payloads fail closed and no production execution surface exists", () => {
  const records = all();
  const inventory = create({ evidenceRecords: records, evaluatedAt: "2026-09-02T15:10:00Z" });
  assert.throws(
    () => verify({ inventory: { ...inventory, productionReady: true }, evidenceRecords: records }),
    (error) => error.code === "readiness_inventory_tampered",
  );
  assert.throws(
    () => create({ evidenceRecords: [{ ...ev(C[0], 0), rawImage: "x" }], evaluatedAt: "2026-09-02T15:10:00Z" }),
    (error) => error.code === "readiness_sensitive_payload_forbidden",
  );
  const surface = { create, verify };
  for (const key of ["deploy", "publish", "sign", "decrypt", "storePrivateKey", "writeVault", "deleteTemplate"]) {
    assert.equal(surface[key], undefined);
  }
});
