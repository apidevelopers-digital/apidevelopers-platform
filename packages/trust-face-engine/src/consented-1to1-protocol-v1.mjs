import { createHash } from "node:crypto";

export const TRUST_FACE_CONSENTED_1TO1_PROTOCOL_V1 = Object.freeze({
  version: "trust-face-consented-1to1-protocol/v1",
  authorityBasisRequired: "consented-lab",
  modality: "face-1to1",
  roles: Object.freeze(["enrollment", "probe"]),
  minimumSubjects: 2,
  minimumEnrollmentPerSubject: 1,
  minimumProbePerSubject: 1,
  rawBiometricPayloadAccepted: false,
  rawEmbeddingAccepted: false,
  realMetricsReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceConsented1to1ProtocolV1Error";
  error.code = code;
  throw error;
}

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_protocol_field", $${field} is required`);
  }
  return value.trim();
}

function assertMetadataOnly(sample, index) {
  for (const field of ["pixels","bytes","buffer","image","imageData","rawImage","embedding","template","biometricTemplate"]) {
    if (field in sample) {
      fail("raw_biometric_payload_forbidden", $samples[${index}].${field} is forbidden`);
    }
  }
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function buildConsented1to1EvaluationProtocol({
  manifest,
  maxPairs = 100000,
} = {}) {
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.samples)) {
    fail("invalid_manifest", "manifest.samples is required");
  }
  if (manifest.authority?.basis !== TRUST_FACE_CONSENTED_1TO1_PROTOCOL_V1.authorityBasisRequired) {
    fail("consented_lab_authority_required", "manifest authority basis must be consented-lab");
  }
  if (!Number.isInteger(maxPairs) || maxPairs < 2 || maxPairs > 1000000) {
    fail("invalid_max_pairs", "maxPairs must be an integer between 2 and 1000000");
  }

  const subjects = new Map();
  const sampleIds = new Set();

  const normalized = manifest.samples.map((sample, index) => {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
      fail("invalid_sample", `samples[${index}] must be an object`);
    }
    assertMetadataOnly(sample, index);
    const sampleId = required(sample.sampleId, `samples[${index}].sampleId`);
    const subjectId = required(sample.subjectId, `samples[${index}].subjectId`);
    const assetRef = required(sample.assetRef, `samples[${index}].assetRef`);
    const role = required(sample.role, `samples[${index}].role`);
    if (!TRUST_FACE_CONSENTED_1TO1_PROTOCOL_V1.roles.includes(role)) {
      fail("invalid_sample_role", `samples[${index}].role must be enrollment or probe`);
    }
    if (sampleIds.has(sampleId)) fail("duplicate_sample_id", `duplicate sampleId: ${sampleId}`);
    sampleIds.add(sampleId);

    const normalizedSample = Object.freeze({ sampleId, subjectId, assetRef, role });
    const bucket = subjects.get(subjectId) ?? { enrollment: [], probe: [] };
    bucket[role].push(normalizedSample);
    subjects.set(subjectId, bucket);
    return normalizedSample;
  });

  if (subjects.size < TRUST_FACE_CONSENTED_1TO1_PROTOCOL_V1.minimumSubjects) {
    fail("insufficient_subjects", "at least two consented subjects are required");
  }

  for (const [subjectId, bucket] of subjects) {
    if (bucket.enrollment.length < 1 || bucket.probe.length < 1) {
      fail("incomplete_subject_roles", `subject ${subjectId} requires enrollment and probe samples`);
    }
  }

  const orderedSubjects = [...subjects.entries()].sort(([a], [b]) => a.localeCompare(b));
  const genuinePairs = [];
  const impostorPairs = [];

  for (const [subjectId, bucket] of orderedSubjects) {
    const enrollments = [...bucket.enrollment].sort((a,b) => a.sampleId.localeCompare(b.sampleId));
    const probes = [...bucket.probe].sort((a,b) => a.sampleId.localeCompare(b.sampleId));
    for (const enrollment of enrollments) {
      for (const probe of probes) {
        genuinePairs.push(Object.freeze({
          pairId: `genuine:$${enrollment.sampleId}::${probe.sampleId}`,
          sameSubject: true,
          subjectId,
          referenceSampleId: enrollment.sampleId,
          probeSampleId: probe.sampleId,
        }));
      }
    }
  }

  outer:
  for (let i = 0; i < orderedSubjects.length; i += 1) {
    const [, left] = orderedSubjects[i];
    const leftEnrollments = [...left.enrollment].sort((a,b) => a.sampleId.localeCompare(b.sampleId));
    for (let j = 0; j < orderedSubjects.length; j += 1) {
      if (i === j) continue;
      const [, right] = orderedSubjects[j];
      const rightProbes = [...right.probe].sort((a,b) => a.sampleId.localeCompare(b.sampleId));
      for (const enrollment of leftEnrollments) {
        for (const probe of rightProbes) {
          impostorPairs.push(Object.freeze({
            pairId: `impostor:${enrollment.sampleId}::${probe.sampleId}`,
            sameSubject: false,
            referenceSampleId: enrollment.sampleId,
            probeSampleId: probe.sampleId,
          }));
          if (genuinePairs.length + impostorPairs.length >= maxPairs) break outer;
        }
      }
    }
  }

  if (!genuinePairs.length || !impostorPairs.length) {
    fail("insufficient_evaluation_pairs", "protocol requires genuine and impostor pairs");
  }

  const pairs = Object.freeze([...genuinePairs, ...impostorPairs]);
  const body = Object.freeze({
    version: TRUST_FACE_CONSENTED_1TO1_PROTOCOL_V1.version,
    manifestDigest: manifest.digest ?? null,
    authorityBasis: manifest.authority.basis,
    modality: TRUST_FACE_CONSENTED_1TO1_PROTOCOL_V1.modality,
    samples: Object.freeze(normalized),
    pairs,
  });

  return Object.freeze({
    ...body,
    protocolDigest: sha256(body),
    subjectCount: subjects.size,
    enrollmentSampleCount: normalized.filter((sample) => sample.role === "enrollment").length,
    probeSampleCount: normalized.filter((sample) => sample.role === "probe").length,
    genuinePairCount: genuinePairs.length,
    impostorPairCount: impostorPairs.length,
    pairCount: pairs.length,
    realMetricsReady: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
