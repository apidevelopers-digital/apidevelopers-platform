import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";

import {
  TRUST_FACE_CONTROLFACE10K_CANDIDATE_V1,
  assertExternalBenchmarkReadyV1,
} from "./external-benchmark-candidate-v1.mjs";

function requiredPath(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError("archivePath must be a non-empty string");
  }
  return value.trim();
}

function validSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

async function sha256File(path) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);

    stream.on("error", reject);
    stream.on("ndata", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function verifyExternalBenchmarkArchiveMaterializationV1({
  archivePath,
  candidate = TRUST_FACE_CONTROLFACE10K_CANDIDATE_V1,
} = {}) {
  const path = requiredPath(archivePath);

  if (!candidate || typeof candidate !== "object") {
    throw new TypeError("candidate must be an object");
  }

  const expectedBytes = candidate.sourceArchiveExpectedBytes;
  const expectedSha256 = candidate.sourceArchiveExpectedSha256;

  if (!Number.isInteger(expectedBytes) || expectedBytes < 1) {
    throw new Error("candidate sourceArchiveExpectedBytes must be a positive integer");
  }
  if (!validSha256(expectedSha256)) {
    throw new Error("candidate sourceArchiveExpectedSha256 must be a lowercase SHA-256 hex digest");
  }

  const metadata = await stat(path);
  if (!metadata.isFile()) {
    throw new Error("benchmark archive path must point to a regular file");
  }

  if (metadata.size !== expectedBytes) {
    throw new Error(
      `benchmark archive byte size mismatch: expected ${expectedBytes}, got ${metadata.size}`,
    );
  }

  const digest = await sha256File(path);
  if (digest !== expectedSha256) {
    throw new Error(
      `benchmark archive SHA-256 mismatch: expected ${expectedSha256}, got ${digest}`,
    );
  }

  const admission = assertExternalBenchmarkReadyV1({
    ...candidate,
    artifactMaterialized: true,
    artifactDigestVerified: true,
    artifactSha256: digest,
    artifactBytes: metadata.size,
  });

  return Object.freeze({
    version: "trust-face-external-benchmark-materialization-verification/v1",
    mode: "lab-only",
    candidateId: admission.candidateId,
    archiveBasename: basename(path),
    archiveBytes: metadata.size,
    archiveSha256: digest,
    integrityVerified: true,
    benchmarkExecutionAuthorized: admission.benchmarkExecutionAuthorized,
    benchmarkOnly: admission.benchmarkOnly,
    bandFrozen: admission.bandFrozen,
    calibrationMutationAllowed: admission.calibrationMutationAllowed,
    archiveContentExtracted: false,
    archiveCopiedByVerifier: false,
    rawBiometricPayloadStored: false,
    thresholdCalibrated: false,
    productionAuthorized: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
