import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { TRUST_FACE_CONTROLFACE10K_CANDIDATE_V1 } from "../src/external-benchmark-candidate-v1.mjs";
import { verifyExternalBenchmarkArchiveMaterializationV1 } from "../src/external-benchmark-materialization-v1.mjs";

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function fixtureCandidate(buffer, overrides = {}) {
  return {
    ...TRUST_FACE_CONTROLFACE10K_CANDIDATE_V1,
    candidateId: "controlface10k-materialization-fixture-v1",
    sourceArchiveExpectedBytes: buffer.length,
    sourceArchiveExpectedSha256: digest(buffer),
    ...overrides,
  };
}

test("verifies exact byte size and SHA-256 without extracting the archive", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trust-face-materialization-"));
  try {
    const archivePath = join(dir, "fixture.zip");
    const bytes = Buffer.from("trust-face-controlface-fixture-v1\n", "utf8");
    await writeFile(archivePath, bytes);

    const result = await verifyExternalBenchmarkArchiveMaterializationV1({
      archivePath,
      candidate: fixtureCandidate(bytes),
    });

    assert.equal(result.integrityVerified, true);
    assert.equal(result.archiveBasename, "fixture.zip");
    assert.equal(result.archiveBytes, bytes.length);
    assert.equal(result.archiveSha256, digest(bytes));
    assert.equal(result.benchmarkExecutionAuthorized, true);
    assert.equal(result.benchmarkOnly, true);
    assert.equal(result.bandFrozen, true);
    assert.equal(result.calibrationMutationAllowed, false);
    assert.equal(result.archiveContentExtracted, false);
    assert.equal(result.archiveCopiedByVerifier, false);
    assert.equal(result.rawBiometricPayloadStored, false);
    assert.equal(result.thresholdCalibrated, false);
    assert.equal(result.productionReady, false);
    assert.equal(result.biometricClaimReady, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fails before hashing when the byte size differs from the pinned value", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trust-face-materialization-"));
  try {
    const archivePath = join(dir, "fixture.zip");
    const bytes = Buffer.from("small-fixture", "utf8");
    await writeFile(archivePath, bytes);

    await assert.rejects(
      () =>
        verifyExternalBenchmarkArchiveMaterializationV1({
          archivePath,
          candidate: fixtureCandidate(bytes, {
            sourceArchiveExpectedBytes: bytes.length + 1,
          }),
        }),
      /byte size mismatch/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fails closed when the file digest differs from the pinned digest", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trust-face-materialization-"));
  try {
    const archivePath = join(dir, "fixture.zip");
    const bytes = Buffer.from("digest-fixture", "utf8");
    await writeFile(archivePath, bytes);

    await assert.rejects(
      () =>
        verifyExternalBenchmarkArchiveMaterializationV1({
          archivePath,
          candidate: fixtureCandidate(bytes, {
            sourceArchiveExpectedSha256: "0".repeat(64),
          }),
        }),
      /SHA-256 mismatch/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects directories and never treats them as benchmark archives", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trust-face-materialization-"));
  try {
    const nested = join(dir, "not-an-archive");
    await mkdir(nested);
    const bytes = Buffer.from("fixture", "utf8");

    await assert.rejects(
      () =>
        verifyExternalBenchmarkArchiveMaterializationV1({
          archivePath: nested,
          candidate: fixtureCandidate(bytes),
        }),
      /regular file/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("requires a non-empty path", async () => {
  await assert.rejects(
    () => verifyExternalBenchmarkArchiveMaterializationV1({ archivePath: "  " }),
    /archivePath must be a non-empty string/,
  );
});
