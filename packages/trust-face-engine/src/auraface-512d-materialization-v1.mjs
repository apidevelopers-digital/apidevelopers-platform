import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import {
  TRUST_FACE_AURAFACE_512D_CANDIDATE_V1,
  createAuraFace512dCandidateAdmissionV1,
} from "./auraface-512d-candidate-v1.mjs";

function requiredPath(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError("artifactPath must be a non-empty string");
  }
  return value.trim();
}

function expectedDigestHex(value) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new TypeError("expectedDigest must be sha256:<64 lowercase hex>");
  }
  return value.slice("sha256:".length);
}

async function sha256File(path) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function verifyPinnedOnnxArtifactV1({
  artifactPath,
  expectedBytes,
  expectedDigest,
} = {}) {
  const path = requiredPath(artifactPath);
  if (!Number.isInteger(expectedBytes) || expectedBytes < 1) {
    throw new TypeError("expectedBytes must be a positive integer");
  }
  const expectedSha256 = expectedDigestHex(expectedDigest);

  const metadata = await stat(path);
  if (!metadata.isFile()) {
    throw new Error("artifactPath must point to a regular file");
  }
  if (metadata.size !== expectedBytes) {
    throw new Error(
      `artifact byte size mismatch: expected ${expectedBytes}, got ${metadata.size}`,
    );
  }

  const actualSha256 = await sha256File(path);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `artifact SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`,
    );
  }

  return Object.freeze({
    version: "trust-face-pinned-onnx-materialization-verification/v1",
    artifactBytes: metadata.size,
    artifactSha256: `sha256:${actualSha256}`,
    integrityVerified: true,
    artifactCopiedByVerifier: false,
    artifactContentExtracted: false,
    rawBiometricPayloadStored: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export async function verifyAuraFace512dMaterializationV1({
  artifactPath,
} = {}) {
  const integrity = await verifyPinnedOnnxArtifactV1({
    artifactPath,
    expectedBytes: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.artifactBytes,
    expectedDigest: TRUST_FACE_AURAFACE_512D_CANDIDATE_V1.weightsDigest,
  });

  const admission = createAuraFace512dCandidateAdmissionV1({
    sourceIntegrityVerified: true,
  });

  if (admission.labInferenceEligible !== true) {
    throw new Error("AuraFace candidate must become lab-inference eligible after exact integrity verification");
  }
  if (admission.productUseEligible !== false) {
    throw new Error("AuraFace candidate must remain product-use ineligible at the current evidence state");
  }

  return Object.freeze({
    version: "trust-face-auraface-512d-materialization-verification/v1",
    mode: "lab-candidate-only",
    modelId: admission.modelId,
    sourceRevision: admission.sourceRevision,
    artifactBytes: integrity.artifactBytes,
    artifactSha256: integrity.artifactSha256,
    sourceIntegrityVerified: true,
    labInferenceEligible: true,
    productEmbeddingDimCompatible: admission.productEmbeddingDimCompatible,
    productUseEligible: false,
    trainingDataProvenanceStatus: admission.trainingDataProvenanceStatus,
    authenticationUseClarified: admission.authenticationUseClarified,
    independentValidationStatus: admission.independentValidationStatus,
    evaluationDigest: admission.evaluationDigest,
    artifactCopiedByVerifier: false,
    artifactContentExtracted: false,
    rawBiometricPayloadStored: false,
    benchmarkExecutionAuthorized: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
