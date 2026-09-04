import { createHash } from "node:crypto";

export const TRUST_FACE_CONTROLFACE10K_SUBSET_PLAN_V1 = Object.freeze({
  version: "trust-face-controlface10k-subset-plan/v1",
  mode: "lab-only",
  benchmarkCandidateId: "controlface10k-humingamelab-v1",
  selectionMethod: "sha256-normalized-identity-path-ascending",
  requestedIdentityCount: 64,
  expectedImagesPerIdentity: 3,
  requestedImageCount: 192,
  includeAllImagesForSelectedIdentity: true,
  demographicAttributeSelectionUsed: false,
  resultAwareSelectionUsed: false,
  benchmarkOnly: true,
  bandFrozen: true,
  calibrationMutationAllowed: false,
  thresholdCalibrated: false,
  productionAuthorized: false,
  productionReady: false,
  biometricClaimReady: false,
});

function normalizeIdentityPath(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError("identity path must be a non-empty string");
  }
  return value.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+/g, "/").trim();
}

function identityKey(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function selectControlFace10KIdentitySubsetV1(
  identityPaths,
  {
    requestedIdentityCount = TRUST_FACE_CONTROLFACE10K_SUBSET_PLAN_V1.requestedIdentityCount,
  } = {},
) {
  if (!Array.isArray(identityPaths)) {
    throw new TypeError("identityPaths must be an array");
  }
  if (!Number.isInteger(requestedIdentityCount) || requestedIdentityCount < 2) {
    throw new RangeError("requestedIdentityCount must be an integer >= 2");
  }

  const normalized = [...new Set(identityPaths.map(normalizeIdentityPath))];
  if (normalized.length < requestedIdentityCount) {
    throw new RangeError(
      `not enough independent identities: requested ${requestedIdentityCount}, got ${normalized.length}`,
    );
  }

  const selected = normalized
    .map((path) => Object.freeze({ path, key: identityKey(path) }))
    .sort((a, b) => a.key.localeCompare(b.key) || a.path.localeCompare(b.path))
    .slice(0, requestedIdentityCount);

  return Object.freeze({
    version: "trust-face-controlface10k-subset-selection/v1",
    mode: "lab-only",
    benchmarkCandidateId: TRUST_FACE_CONTROLFACE10K_SUBSET_PLAN_V1.benchmarkCandidateId,
    selectionMethod: TRUST_FACE_CONTROLFACE10K_SUBSET_PLAN_V1.selectionMethod,
    availableIdentityCount: normalized.length,
    selectedIdentityCount: selected.length,
    selectedIdentityPaths: Object.freeze(selected.map((entry) => entry.path)),
    selectedIdentityKeys: Object.freeze(selected.map((entry) => entry.key)),
    includeAllImagesForSelectedIdentity: true,
    expectedImagesPerIdentity: 3,
    expectedSelectedImageCount: selected.length * 3,
    demographicAttributeSelectionUsed: false,
    resultAwareSelectionUsed: false,
    benchmarkOnly: true,
    bandFrozen: true,
    calibrationMutationAlowed: false,
    thresholdCalibrated: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
