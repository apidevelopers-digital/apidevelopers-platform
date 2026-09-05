import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  verifyAuraFace512dMaterializationV1,
  verifyPinnedOnnxArtifactV1,
} from "../src/auraface-512d-materialization-v1.mjs";

const digest = (buffer) =>
  `sha256:${createHash("sha256").update(buffer).digest("hex")}`;

test("generic pinned ONNX verifier accepts exact bytes and SHA-256 without extracting or copying", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trust-face-onnx-verify-"));
  try {
    const artifactPath = join(dir, "fixture.onnx");
    const bytes = Buffer.from("trust-face-pinned-onnx-fixture-v1\n", "utf8");
    await writeFile(artifactPath, bytes);

    const result = await verifyPinnedOnnxArtifactV1({
      artifactPath,
      expectedBytes: bytes.length,
      expectedDigest: digest(bytes),
    });

    assert.equal(result.integrityVerified, true);
    assert.equal(result.artifactBytes, bytes.length);
    assert.equal(result.artifactSha256, digest(bytes));
    assert.equal(result.artifactCopiedByVerifier, false);
    assert.equal(result.artifactContentExtracted, false);
    assert.equal(result.rawBiometricPayloadStored, false);
    assert.equal(result.productionReady, false);
    assert.equal(result.biometricClaimReady, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("generic pinned ONNX verifier fails closed on size mismatch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trust-face-onnx-verify-"));
  try {
    const artifactPath = join(dir, "fixture.onnx");
    const bytes = Buffer.from("size-fixture", "utf8");
    await writeFile(artifactPath, bytes);

    await assert.rejects(
      () =>
        verifyPinnedOnnxArtifactV1({
          artifactPath,
          expectedBytes: bytes.length + 1,
          expectedDigest: digest(bytes),
        }),
      /byte size mismatch/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("generic pinned ONNX verifier fails closed on digest mismatch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trust-face-onnx-verify-"));
  try {
    const artifactPath = join(dir, "fixture.onnx");
    const bytes = Buffer.from("digest-fixture", "utf8");
    await writeFile(artifactPath, bytes);

    await assert.rejects(
      () =>
        verifyPinnedOnnxArtifactV1({
          artifactPath,
          expectedBytes: bytes.length,
          expectedDigest: `sha256:${"0".repeat(64)}`,
        }),
      /SHA-256 mismatch/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("generic pinned ONNX verifier rejects directories and empty paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trust-face-onnx-verify-"));
  try {
    const nested = join(dir, "nested");
    await mkdir(nested);

    await assert.rejects(
      () =>
        verifyPinnedOnnxArtifactV1({
          artifactPath: nested,
          expectedBytes: 1,
          expectedDigest: `sha256:${"0".repeat(64)}`,
        }),
      /regular file/,
    );

    await assert.rejects(
      () =>
        verifyPinnedOnnxArtifactV1({
          artifactPath: " ",
          expectedBytes: 1,
          expectedDigest: `sha256:${"0".repeat(64)}`,
        }),
      /non-empty string/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("AuraFace wrapper fails closed until the exact 260694151-byte artifact is materialized", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trust-face-auraface-verify-"));
  try {
    const artifactPath = join(dir, "glintr100.onnx");
    await writeFile(artifactPath, Buffer.from("not-the-real-artifact", "utf8"));

    await assert.rejects(
      () => verifyAuraFace512dMaterializationV1({ artifactPath }),
      /byte size mismatch/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
