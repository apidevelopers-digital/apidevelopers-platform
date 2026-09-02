import assert from "node:assert/strict";
import test from "node:test";
import { TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1 as P, createTrustFaceProductionReadinessReviewInventory as create, assertTrustFaceProductionReadinessReviewInventory as verify } from "../src/production-readiness-review-gate-v1.mjs";

const D = c => `sha256:${c.repeat(64)}`;
const C = P.requiredEvidenceCategories;
const ev = (category, i, o = {}) => ({ evidenceId: `e-${i+1}`, category, artifactDigest: D((i+1).toString(16)), sourceRef: `artifact://${category}`, assessorRef: `assessor:${category}`, assessedAt: "2026-09-02T15:00:00Z", status: "pass", independentAssessmentDeclared: true, ...o });
const all = () => C.map(ev);

test("profile never claims production readiness", () => {
  assert.equal(P.requiredEvidenceCategories.length, 8); assert.equal(P.metadataOnly, true);
  for (const k of ["evidenceAuthenticityVerified","externalEvidenceVerifierIntegrated","independentValidationVerified","productionReady","biometricClaimReady"]) assert.equal(P[k], false);
});

test("incomplete evidence stays blocked", () => {
  const x = create({ evidenceRecords: [ev(C[0],0)], evaluatedAt: "2026-09-02T15:10:00Z" });
  assert.equal(x.reviewEligible, false); assert.equal(x.blockers.length, 7); assert.equal(x.productionReady, false);
});

test("complete passing metadata is only review eligible", () => {
  const records = all(), x = create({ evidenceRecords: records, evaluatedAt: "2026-09-02T15:10:00Z" });
  assert.equal(x.reviewEligible, true); assert.equal(x.reasonCode, "external-independent-validation-still-required");
  assert.equal(x.independentValidationVerified, false); assert.equal(x.productionReady, false);
  assert.equal(verify({ inventory: x, evidenceRecords: records }).valid, true);
});

test("failed or non-independent evidence remains blocked", () => {
  const failed = all().map(x => x.category === "liveness-pad" ? { ...x, status: "fail" } : x);
  assert.deepEqual(create({ evidenceRecords: failed, evaluatedAt: "2026-09-02T15:10:00Z" }).blockers, [{ category: "liveness-pad", blocker: "evidence-failed" }]);
  const nonIndependent = all().map(x => x.category === "production-sdk" ? { ...x, independentAssessmentDeclared: false } : x);
  assert.deepEqual(create({ evidenceRecords: nonIndependent, evaluatedAt: "2026-09-02T15:10:00Z" }).blockers, [{ category: "production-sdk", blocker: "independent-assessment-not-declared" }]);
});

test("duplicates fail closed", () => {
  assert.throws(() => create({ evidenceRecords: [ev(C[0],0), ev(C[0],1)], evaluatedAt: "2026-09-02T15:10:00Z" }), e => e.code === "readiness_duplicate_category");
  assert.throws(() => create({ evidenceRecords: [ev(C[0],0), ev(C[1],1,{evidenceId:"e-1"})], evaluatedAt: "2026-09-02T15:10:00Z" }), e => e.code === "readiness_duplicate_evidence_id");
  assert.throws(() => create({ evidenceRecords: [ev(C[0],0), ev(C[1],1,{artifactDigest:D("1")})], evaluatedAt: "2026-09-02T15:10:00Z" }), e => e.code === "readiness_duplicate_artifact_digest");
});

test("unknown category and malformed digest fail closed", () => {
  assert.throws(() => create({ evidenceRecords: [ev("unknown",0)], evaluatedAt: "2026-09-02T15:10:00Z" }), e => e.code === "readiness_unknown_category");
  assert.throws(() => create({ evidenceRecords: [ev(C[0],0,{artifactDigest:"bad"})], evaluatedAt: "2026-09-02T15:10:00Z" }), e => e.code === "invalid_readiness_digest");
});

test("tampered inventory fails closed", () => {
  const records = all(), x = create({ evidenceRecords: records, evaluatedAt: "2026-09-02T15:10:00Z" });
  assert.throws(() => verify({ inventory: { ...x, productionReady: true }, evidenceRecords: records }), e => e.code === "readiness_inventory_tampered");
});

test("sensitive payloads rejected and no production execution surface exists", () => {
  assert.throws(() => create({ evidenceRecords: [{ ...ev(C[0],0), rawImage: "x" }], evaluatedAt: "2026-09-02T15:10:00Z" }), e => e.code === "readiness_sensitive_payload_forbidden");
  const s = { create, verify };
  for (const k of ["deploy","publish","sign","decrypt","storePrivateKey","writeVault","deleteTemplate"]) assert.equal(s[k], undefined);
});
