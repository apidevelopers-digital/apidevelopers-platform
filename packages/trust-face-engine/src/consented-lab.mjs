
import { createDatasetManifest, buildVerificationProtocol } from "./dataset-protocol.mjs";
import { evaluateTrustFacePipeline } from "./evaluation-lab.mjs";

export const TRUST_FACE_CONSENTED_LAB_PROFILE = Object.freeze({
  version: "trust-face-consented-lab/v0",
  productionReady: false,
  biometricClaimReady: false,
  rawBiometricPersistenceInRepo: false,
  rawBiometricLogging: false,
  minimumVerificationSubjects: 2,
  defaultRetentionDays: 30,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceConsentedLabError";
  error.code = code;
  throw error;
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_consent_lab_field", `${field} is required`);
  return value.trim();
}

function assertNoDirectPii(record, field) {
  for (const key of ["name", "fullName", "email", "phone", "document", "cpf", "rg"]) {
    if (key in record) fail("direct_pii_forbidden", `${field}.${key} must not be stored in consent-lab metadata`);
  }
}

function toIso(value, field) {
  const text = requiredString(value, field);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) fail("invalid_consent_lab_date", `${field} must be an ISO date`);
  return new Date(timestamp).toISOString();
}

export function createConsentedLabPlan({
  labId,
  purpose = "trust-face-1to1-evaluation",
  createdAt,
  retentionDays = TRUST_FACE_CONSENTED_LAB_PROFILE.defaultRetentionDays,
  participants,
} = {}) {
  const normalizedLabId = requiredString(labId, "labId");
  const normalizedPurpose = requiredString(purpose, "purpose");
  const normalizedCreatedAt = toIso(createdAt, "createdAt");
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 90) {
    fail("invalid_retention_days", "retentionDays must be an integer between 1 and 90");
  }
  if (!Array.isArray(participants) || participants.length < TRUST_FACE_CONSENTED_LAB_PROFILE.minimumVerificationSubjects) {
    fail("insufficient_consented_participants", "at least two consented participants are required for 1:1 verification evaluation");
  }

  const subjectIds = new Set();
  const normalizedParticipants = participants.map((participant, index) => {
    if (!participant || typeof participant !== "object") fail("invalid_participant", `participants[${index}] must be an object`);
    assertNoDirectPii(participant, `participants[${index}]`);
    const subjectId = requiredString(participant.subjectId, `participants[${index}].subjectId`);
    if (subjectIds.has(subjectId)) fail("duplicate_subject_id", `duplicate subjectId: ${subjectId}`);
    subjectIds.add(subjectId);
    return Object.freeze({
      subjectId,
      consentRef: requiredString(participant.consentRef, `participants[${index}].consentRef`),
      consentCapturedAt: toIso(participant.consentCapturedAt, `participants[${index}].consentCapturedAt`),
      adultConfirmed: participant.adultConfirmed === true,
      voluntaryConfirmed: participant.voluntaryConfirmed === true,
      purposeConfirmed: participant.purposeConfirmed === true,
      deletionRightConfirmed: participant.deletionRightConfirmed === true,
    });
  });

  for (const participant of normalizedParticipants) {
    if (!participant.adultConfirmed || !participant.voluntaryConfirmed || !participant.purposeConfirmed || !participant.deletionRightConfirmed) {
      fail("incomplete_consent_evidence", `participant ${participant.subjectId} has incomplete consent evidence`);
    }
  }

  const retentionUntil = new Date(Date.parse(normalizedCreatedAt) + retentionDays * 86400000).toISOString();

  return Object.freeze({
    profile: TRUST_FACE_CONSENTED_LAB_PROFILE,
    labId: normalizedLabId,
    purpose: normalizedPurpose,
    createdAt: normalizedCreatedAt,
    retentionDays,
    retentionUntil,
    participants: Object.freeze(normalizedParticipants),
    storagePolicy: Object.freeze({
      rawImagesInGit: false,
      rawEmbeddingsInGit: false,
      rawBiometricLogs: false,
      localEphemeralProcessingPreferred: true,
    }),
  });
}

function participantMap(plan) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.participants)) fail("invalid_consent_lab_plan", "valid consent-lab plan is required");
  return new Map(plan.participants.map((entry) => [entry.subjectId, entry]));
}

export function createConsentedLabManifest({
  plan,
  datasetId,
  version,
  samples,
} = {}) {
  const participants = participantMap(plan);
  if (!Array.isArray(samples) || samples.length < 4) fail("insufficient_manifest_samples", "at least four face samples are required");

  for (const [index, sample] of samples.entries()) {
    if (!participants.has(sample?.subjectId)) {
      fail("sample_without_consent", `samples[${index}] references a subject without consent`);
    }
  }

  const evidenceRef = `consented-lab:${plan.labId}:${plan.createdAt}`;
  return createDatasetManifest({
    datasetId,
    version,
    modality: "face-1to1",
    authority: {
      basis: "consented-lab",
      evidenceRef,
      retentionClass: `delete-by:${plan.retentionUntil}`,
    },
    samples,
  });
}

function assertLoadedImage(value, assetRef) {
  if (!value || typeof value !== "object") fail("invalid_loaded_image", `loader returned invalid image for ${assetRef}`);
  if (!Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 16 || value.height < 16) {
    fail("invalid_loaded_image", `loader returned invalid dimensions for ${assetRef}`);
  }
  if (!(value.pixels instanceof Uint8Array) || value.pixels.length !== value.width * value.height) {
    fail("invalid_loaded_image", `loader must return grayscale Uint8Array for ${assetRef}`);
  }
  return value;
}

export async function runConsentedLabEvaluation({
  plan,
  manifest,
  detectorModel,
  metricModel,
  loadGrayscaleSample,
  negativeSamples = [],
  verificationProtocol = null,
  thresholds = [0.5, 0.6, 0.7, 0.8, 0.9],
} = {}) {
  participantMap(plan);
  if (!manifest || manifest.authority?.basis !== "consented-lab") fail("invalid_consent_lab_manifest", "consented-lab manifest is required");
  if (typeof loadGrayscaleSample !== "function") fail("loader_required", "loadGrayscaleSample callback is required");
  if (!detectorModel || !metricModel) fail("evaluation_models_required", "detectorModel and metricModel are required");

  const positive = [];
  for (const sample of manifest.samples) {
    const loaded = assertLoadedImage(await loadGrayscaleSample(sample.assetRef), sample.assetRef);
    positive.push({
      sampleId: sample.sampleId,
      subjectId: sample.subjectId,
      facePresent: true,
      width: loaded.width,
      height: loaded.height,
      pixels: loaded.pixels,
      landmarks: loaded.landmarks ?? null,
    });
  }

  const negatives = [];
  for (const [index, sample] of negativeSamples.entries()) {
    if (!sample || typeof sample !== "object") fail("invalid_negative_sample", `negativeSamples[${index}] must be an object`);
    const assetRef = requiredString(sample.assetRef, `negativeSamples[${index}].assetRef`);
    const loaded = assertLoadedImage(await loadGrayscaleSample(assetRef), assetRef);
    negatives.push({
      sampleId: requiredString(sample.sampleId, `negativeSamples[${index}].sampleId`),
      subjectId: null,
      facePresent: false,
      width: loaded.width,
      height: loaded.height,
      pixels: loaded.pixels,
      landmarks: null,
    });
  }

  const protocol = verificationProtocol ?? buildVerificationProtocol({
    manifest,
    split: "test",
    impostorRatio: 1,
  });

  const report = evaluateTrustFacePipeline({
    detectorModel,
    metricModel,
    dataset: {
      datasetId: manifest.datasetId,
      authority: { basis: "consented-lab" },
      samples: [...positive, ...negatives],
    },
    verificationPairs: protocol.pairs,
    thresholds,
  });

  return Object.freeze({
    profile: TRUST_FACE_CONSENTED_LAB_PROFILE,
    labId: plan.labId,
    dataset: Object.freeze({
      datasetId: manifest.datasetId,
      manifestDigest: manifest.digest,
      authorityBasis: "consented-lab",
      positiveSamples: positive.length,
      negativeSamples: negatives.length,
    }),
    detection: report.detection,
    verification: report.verification,
    retentionUntil: plan.retentionUntil,
    rawImagesReturned: false,
    rawEmbeddingsReturned: false,
    subjectIdsReturned: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
