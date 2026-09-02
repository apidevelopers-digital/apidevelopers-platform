import { createHash } from "node:crypto";

export const TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1 = Object.freeze({
  version: "trust-face-production-readiness-review-gate/v1",
  mode: "governance-metadata-only",
  requiredEvidenceCategories: Object.freeze([
    "image-embedding-inference", "face-detector", "landmark-alignment", "liveness-pad",
    "template-vault-kms", "revocation-erasure", "production-sdk", "biometric-benchmarks",
  ]),
  metadataOnly: true,
  evidenceAuthenticityVerified: false,
  externalEvidenceVerifierIntegrated: false,
  independentValidationVerified: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceProductionReadinessReviewGateV1Error extends Error {
  constructor(code, message) { super(message); this.name = "TrustFaceProductionReadinessReviewGateV1Error"; this.code = code; }
}
const fail = (code, message) => { throw new TrustFaceProductionReadinessReviewGateV1Error(code, message); };
const req = (v, f) => { if (typeof v !== "string" || !v.trim()) fail("invalid_readiness_field", `${f} is required`); return v.trim(); };
const dg = (v, f) => { const x = req(v, f).toLowerCase(); if (!/^sha256:[0-9a-f]{64}$/.test(x)) fail("invalid_readiness_digest", `${f} must be sha256:<64 hex>`); return x; };
const iso = (v, f) => { const x = req(v, f); const ms = Date.parse(x); if (!Number.isFinite(ms)) fail("invalid_readiness_time", `${f} must be ISO-8601`); return new Date(ms).toISOString(); };
const stable = (v) => Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v);
const sha = (v) => `sha256:${createHash("sha256").update(stable(v)).digest("hex")}`;
const forbidden = new Set(["image","imageData","rawImage","pixels","video","videoData","frames","bytes","buffer","embedding","embeddings","vector","vectors","template","biometricTemplate","templatePayload","ciphertext","encryptedPayload","encryptedTemplate","payload","privateKey","publicKey","keyMaterial","kmsMaterial","secret","secretMaterial","plaintext","signature","token","password"]);

function rejectSensitive(v, seen = new Set()) {
  if (v == null || typeof v !== "object") return;
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) fail("readiness_binary_forbidden", "binary input is forbidden");
  if (seen.has(v)) fail("readiness_circular_input", "circular input is forbidden");
  seen.add(v);
  for (const [k, child] of Object.entries(v)) {
    if (forbidden.has(k)) fail("readiness_sensitive_payload_forbidden", `${k} is forbidden`);
    rejectSensitive(child, seen);
  }
  seen.delete(v);
}

function normalize(r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) fail("readiness_evidence_required", "evidence record is required");
  rejectSensitive(r);
  const category = req(r.category, "category");
  if (!TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1.requiredEvidenceCategories.includes(category)) fail("readiness_unknown_category", `unknown category ${category}`);
  const status = req(r.status, "status");
  if (!["pass","fail"].includes(status)) fail("readiness_invalid_status", "status must be pass or fail");
  return Object.freeze({
    evidenceId: req(r.evidenceId, "evidenceId"),
    category,
    artifactDigest: dg(r.artifactDigest, "artifactDigest"),
    sourceRef: req(r.sourceRef, "sourceRef"),
    assessorRef: req(r.assessorRef, "assessorRef"),
    assessedAt: iso(r.assessedAt, "assessedAt"),
    status,
    independentAssessmentDeclared: r.independentAssessmentDeclared === true,
    authenticityVerifiedByThisGate: false,
  });
}

function build({ evidenceRecords, evaluatedAt }) {
  if (!Array.isArray(evidenceRecords)) fail("readiness_evidence_list_required", "evidenceRecords must be an array");
  const records = evidenceRecords.map(normalize), byCategory = new Map(), ids = new Set(), digests = new Set();
  for (const r of records) {
    if (byCategory.has(r.category)) fail("readiness_duplicate_category", `duplicate category ${r.category}`);
    if (ids.has(r.evidenceId)) fail("readiness_duplicate_evidence_id", `duplicate evidenceId ${r.evidenceId}`);
    if (digests.has(r.artifactDigest)) fail("readiness_duplicate_artifact_digest", `duplicate artifactDigest ${r.artifactDigest}`);
    byCategory.set(r.category, r); ids.add(r.evidenceId); digests.add(r.artifactDigest);
  }
  const categories = TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1.requiredEvidenceCategories.map(category => {
    const evidence = byCategory.get(category) ?? null;
    const blocker = !evidence ? "missing-evidence" : evidence.status !== "pass" ? "evidence-failed" : !evidence.independentAssessmentDeclared ? "independent-assessment-not-declared" : null;
    return Object.freeze({ category, evidence, blocker });
  });
  const blockers = categories.filter(x => x.blocker).map(x => Object.freeze({ category: x.category, blocker: x.blocker }));
  const reviewEligible = blockers.length === 0;
  const body = Object.freeze({
    version: TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1.version,
    mode: TRUST_FACE_PRODUCTION_READINESS_REVIEW_GATE_V1.mode,
    evaluatedAt: iso(evaluatedAt, "evaluatedAt"),
    categories, blockers, evidenceCount: records.length, reviewEligible,
    reasonCode: reviewEligible ? "external-independent-validation-still-required" : "production-readiness-evidence-incomplete-or-failed",
    metadataOnly: true, evidenceAuthenticityVerified: false, externalEvidenceVerifierIntegrated: false,
    independentValidationVerified: false, productionReady: false, biometricClaimReady: false,
  });
  return Object.freeze({ ...body, inventoryDigest: sha(body) });
}

export function createTrustFaceProductionReadinessReviewInventory(input = {}) { rejectSensitive(input); return build(input); }

export function assertTrustFaceProductionReadinessReviewInventory({ inventory, evidenceRecords } = {}) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) fail("readiness_inventory_required", "inventory is required");
  rejectSensitive(inventory);
  const rebuilt = build({ evidenceRecords, evaluatedAt: inventory.evaluatedAt });
  if (stable(inventory) !== stable(rebuilt)) fail("readiness_inventory_tampered", "inventory mismatch");
  return Object.freeze({ valid: true, reviewEligible: rebuilt.reviewEligible, blockerCount: rebuilt.blockers.length, inventoryDigest: rebuilt.inventoryDigest, productionReady: false, independentValidationVerified: false });
}
