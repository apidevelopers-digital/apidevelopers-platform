import { createHash } from "node:crypto";

export const TRUST_FACE_DATASET_PROTOCOL_PROFILE = Object.freeze({
  protocolVersion: "trust-face-dataset-protocol/v0-lab",
  productionReady: false,
  biometricClaimReady: false,
  rawBiometricPayloadAccepted: false,
  subjectDisjointSplitsRequired: true,
  supportedSplits: Object.freeze(["train", "validation", "test"]),
  supportedAuthorityBasis: Object.freeze(["synthetic", "public-licensed", "consented-lab"]),
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceDatasetProtocolError";
  error.code = code;
  throw error;
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_manifest_field", `${field} must be a non-empty string`);
  }
  return value.trim();
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function sha256Hex(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function assertAuthority(authority) {
  if (!authority || typeof authority !== "object" || Array.isArray(authority)) {
    fail("invalid_authority", "authority must be an object");
  }

  const basis = requiredString(authority.basis, "authority.basis");
  if (!TRUST_FACE_DATASET_PROTOCOL_PROFILE.supportedAuthorityBasis.includes(basis)) {
    fail("unsupported_authority_basis", `unsupported authority basis: ${basis}`);
  }

  const evidenceRef = requiredString(authority.evidenceRef, "authority.evidenceRef");
  const retentionClass = requiredString(authority.retentionClass, "authority.retentionClass");

  return Object.freeze({ basis, evidenceRef, retentionClass });
}

function assertMetadataOnlySample(sample, index) {
  const forbidden = [
    "bytes",
    "buffer",
    "pixels",
    "image",
    "imageData",
    "rawImage",
    "embedding",
    "template",
    "biometricTemplate",
  ];

  for (const field of forbidden) {
    if (field in sample) {
      fail(
        "raw_biometric_payload_forbidden",
        `samples[${index}].${field} is forbidden in the metadata-only dataset manifest`,
      );
    }
  }
}

function assertSample(sample, index) {
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
    fail("invalid_sample", `samples[${index}] must be an object`);
  }
  assertMetadataOnlySample(sample, index);

  const sampleId = requiredString(sample.sampleId, `samples[${index}].sampleId`);
  const subjectId = requiredString(sample.subjectId, `samples[${index}].subjectId`);
  const assetRef = requiredString(sample.assetRef, `samples[${index}].assetRef`);
  const split = requiredString(sample.split, `samples[${index}].split`);

  if (!TRUST_FACE_DATASET_PROTOCOL_PROFILE.supportedSplits.includes(split)) {
    fail("invalid_split", `samples[${index}].split must be train, validation, or test`);
  }

  return Object.freeze({
    sampleId,
    subjectId,
    assetRef,
    split,
    captureGroup: sample.captureGroup ? requiredString(sample.captureGroup, `samples[${index}].captureGroup`) : null,
  });
}

function assertSubjectDisjointSplits(samples) {
  const splitsBySubject = new Map();
  for (const sample of samples) {
    const splits = splitsBySubject.get(sample.subjectId) ?? new Set();
    splits.add(sample.split);
    splitsBySubject.set(sample.subjectId, splits);
  }

  const leaks = [];
  for (const [subjectId, splits] of splitsBySubject) {
    if (splits.size > 1) {
      leaks.push({ subjectId, splits: [...splits].sort() });
    }
  }

  if (leaks.length) {
    const description = leaks
      .map((entry) => `${entry.subjectId}:${entry.splits.join("+")}`)
      .join(",");
    fail("subject_split_leakage", `subject identities cross dataset splits: ${description}`);
  }
}

export function createDatasetManifest({
  datasetId,
  version,
  modality = "face-1to1",
  authority,
  samples,
} = {}) {
  const normalizedDatasetId = requiredString(datasetId, "datasetId");
  const normalizedVersion = requiredString(version, "version");
  const normalizedModality = requiredString(modality, "modality");
  const normalizedAuthority = assertAuthority(authority);

  if (!Array.isArray(samples) || samples.length < 4) {
    fail("insufficient_manifest_samples", "at least four metadata-only samples are required");
  }

  const normalizedSamples = samples.map(assertSample);
  const ids = new Set();
  for (const sample of normalizedSamples) {
    if (ids.has(sample.sampleId)) {
      fail("duplicate_sample_id", `duplicate sampleId: ${sample.sampleId}`);
    }
    ids.add(sample.sampleId);
  }

  assertSubjectDisjointSplits(normalizedSamples);

  const orderedSamples = [...normalizedSamples].sort((a, b) => a.sampleId.localeCompare(b.sampleId));
  const manifestBody = Object.freeze({
    protocolVersion: TRUST_FACE_DATASET_PROTOCOL_PROFILE.protocolVersion,
    datasetId: normalizedDatasetId,
    version: normalizedVersion,
    modality: normalizedModality,
    authority: normalizedAuthority,
    samples: Object.freeze(orderedSamples),
  });

  const digest = sha256Hex(manifestBody);

  return Object.freeze({
    ...manifestBody,
    digest: `sha256:${digest}`,
    sampleCount: orderedSamples.length,
    productionReady: false,
    biometricClaimReady: false,
  });
}

function selectSplit(manifest, split) {
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.samples)) {
    fail("invalid_manifest", "manifest.samples is required");
  }
  if (!TRUST_FACE_DATASET_PROTOCOL_PROFILE.supportedSplits.includes(split)) {
    fail("invalid_split", "split must be train, validation, or test");
  }
  return manifest.samples.filter((sample) => sample.split === split);
}

function pairId(kind, left, right) {
  return `${kind}:${left.sampleId}::${right.sampleId}`;
}

export function buildVerificationProtocol({
  manifest,
  split = "test",
  impostorRatio = 1,
  maxPairs = 100000,
} = {}) {
  if (!Number.isFinite(impostorRatio) || impostorRatio <= 0 || impostorRatio > 100) {
    fail("invalid_impostor_ratio", "impostorRatio must be > 0 and <= 100");
  }
  if (!Number.isInteger(maxPairs) || maxPairs < 2 || maxPairs > 1000000) {
    fail("invalid_max_pairs", "maxPairs must be an integer between 2 and 1000000");
  }

  const samples = selectSplit(manifest, split);
  const bySubject = new Map();
  for (const sample of samples) {
    const list = bySubject.get(sample.subjectId) ?? [];
    list.push(sample);
    bySubject.set(sample.subjectId, list);
  }

  const eligibleSubjects = [...bySubject.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort(([a], [b]) => a.localeCompare(b));

  if (eligibleSubjects.length < 2) {
    fail(
      "insufficient_evaluation_subjects",
      `${split} requires at least two subjects with at least two samples each`,
    );
  }

  const genuinePairs = [];
  for (const [, list] of eligibleSubjects) {
    const ordered = [...list].sort((a, b) => a.sampleId.localeCompare(b.sampleId));
    for (let i = 0; i < ordered.length; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        genuinePairs.push(
          Object.freeze({
            pairId: pairId("genuine", ordered[i], ordered[j]),
            sameSubject: true,
            referenceSampleId: ordered[i].sampleId,
            probeSampleId: ordered[j].sampleId,
          }),
        );
      }
    }
  }

  const desiredImpostor = Math.max(1, Math.ceil(genuinePairs.length * impostorRatio));
  const impostorPairs = [];
  outer:
  for (let leftSubject = 0; leftSubject < eligibleSubjects.length; leftSubject += 1) {
    const [, leftSamples] = eligibleSubjects[leftSubject];
    const left = [...leftSamples].sort((a, b) => a.sampleId.localeCompare(b.sampleId));
    for (let rightSubject = leftSubject + 1; rightSubject < eligibleSubjects.length; rightSubject += 1) {
      const [, rightSamples] = eligibleSubjects[rightSubject];
      const right = [...rightSamples].sort((a, b) => a.sampleId.localeCompare(b.sampleId));
      for (let i = 0; i < left.length; i += 1) {
        for (let j = 0; j < right.length; j += 1) {
          impostorPairs.push(
            Object.freeze({
              pairId: pairId("impostor", left[i], right[j]),
              sameSubject: false,
              referenceSampleId: left[i].sampleId,
              probeSampleId: right[j].sampleId,
            }),
          );
          if (impostorPairs.length >= desiredImpostor) break outer;
        }
      }
    }
  }

  if (!impostorPairs.length) {
    fail("insufficient_impostor_pairs", "evaluation protocol could not produce impostor pairs");
  }

  const total = genuinePairs.length + impostorPairs.length;
  if (total > maxPairs) {
    fail("pair_budget_exceeded", `protocol requires ${total} pairs but maxPairs=${maxPairs}`);
  }

  const pairs = Object.freeze([...genuinePairs, ...impostorPairs]);
  const protocolBody = Object.freeze({
    protocolVersion: TRUST_FACE_DATASET_PROTOCOL_PROFILE.protocolVersion,
    manifestDigest: manifest.digest,
    split,
    impostorRatio,
    pairs,
  });

  return Object.freeze({
    ...protocolBody,
    protocolDigest: `sha256:${sha256Hex(protocolBody)}`,
    genuinePairCount: genuinePairs.length,
    impostorPairCount: impostorPairs.length,
    pairCount: pairs.length,
    productionReady: false,
  });
}

export function summarizeDatasetManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.samples)) {
    fail("invalid_manifest", "manifest.samples is required");
  }

  const splitCounts = { train: 0, validation: 0, test: 0 };
  const subjects = new Set();
  for (const sample of manifest.samples) {
    splitCounts[sample.split] += 1;
    subjects.add(sample.subjectId);
  }

  return Object.freeze({
    datasetId: manifest.datasetId,
    version: manifest.version,
    digest: manifest.digest,
    sampleCount: manifest.samples.length,
    subjectCount: subjects.size,
    splitCounts: Object.freeze(splitCounts),
    authorityBasis: manifest.authority?.basis ?? null,
    productionReady: false,
  });
}
