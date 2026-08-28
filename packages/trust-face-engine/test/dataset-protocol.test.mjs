import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_FACE_DATASET_PROTOCOL_PROFILE,
  buildVerificationProtocol,
  createDatasetManifest,
  summarizeDatasetManifest,
} from "../src/dataset-protocol.mjs";

const authority = Object.freeze({
  basis: "synthetic",
  evidenceRef: "repo://trust-face/synthetic-fixtures/v0",
  retentionClass: "ephemeral-lab",
});

function baseSamples() {
  return [
    { sampleId: "train-a-1", subjectId: "train-a", assetRef: "lab://train-a/1", split: "train" },
    { sampleId: "train-a-2", subjectId: "train-a", assetRef: "lab://train-a/2", split: "train" },
    { sampleId: "test-a-1", subjectId: "test-a", assetRef: "lab://test-a/1", split: "test" },
    { sampleId: "test-a-2", subjectId: "test-a", assetRef: "lab://test-a/2", split: "test" },
    { sampleId: "test-b-1", subjectId: "test-b", assetRef: "lab://test-b/1", split: "test" },
    { sampleId: "test-b-2", subjectId: "test-b", assetRef: "lab://test-b/2", split: "test" },
  ];
}

test("profile explicitly forbids raw biometric payloads and production claims", () => {
  assert.equal(TRUST_FACE_DATASET_PROTOCOL_PROFILE.productionReady, false);
  assert.equal(TRUST_FACE_DATASET_PROTOCOL_PROFILE.biometricClaimReady, false);
  assert.equal(TRUST_FACE_DATASET_PROTOCOL_PROFILE.rawBiometricPayloadAccepted, false);
  assert.equal(TRUST_FACE_DATASET_PROTOCOL_PROFILE.subjectDisjointSplitsRequired, true);
});

test("manifest digest is deterministic regardless of sample input order", () => {
  const samples = baseSamples();

  const first = createDatasetManifest({
    datasetId: "synthetic-face-v0",
    version: "0.1.0",
    authority,
    samples,
  });

  const second = createDatasetManifest({
    datasetId: "synthetic-face-v0",
    version: "0.1.0",
    authority,
    samples: [...samples].reverse(),
  });

  assert.equal(first.digest, second.digest);
  assert.deepEqual(
    first.samples.map((sample) => sample.sampleId),
    [...first.samples.map((sample) => sample.sampleId)].sort(),
  );
  assert.equal(first.productionReady, false);
});

test("metadata-only manifest rejects raw biometric payload fields", () => {
  const samples = baseSamples();
  samples[0] = { ...samples[0], pixels: [0, 1, 2] };

  assert.throws(
    () =>
      createDatasetManifest({
        datasetId: "synthetic-face-v0",
        version: "0.1.0",
        authority,
        samples,
      }),
    (error) => error?.code === "raw_biometric_payload_forbidden",
  );
});

test("manifest rejects subject leakage across train and test", () => {
  const samples = baseSamples();
  samples.push({
    sampleId: "leak-1",
    subjectId: "train-a",
    assetRef: "lab://train-a/leak",
    split: "test",
  });

  assert.throws(
    () =>
      createDatasetManifest({
        datasetId: "synthetic-face-v0",
        version: "0.1.0",
        authority,
        samples,
      }),
    (error) => error?.code === "subject_split_leakage",
  );
});

test("verification protocol creates deterministic genuine and impostor pairs", () => {
  const manifest = createDatasetManifest({
    datasetId: "synthetic-face-v0",
    version: "0.1.0",
    authority,
    samples: baseSamples(),
  });

  const first = buildVerificationProtocol({ manifest, split: "test", impostorRatio: 1 });
  const second = buildVerificationProtocol({ manifest, split: "test", impostorRatio: 1 });

  assert.equal(first.protocolDigest, second.protocolDigest);
  assert.equal(first.genuinePairCount, 2);
  assert.equal(first.impostorPairCount, 2);
  assert.equal(first.pairCount, 4);
  assert.equal(first.pairs.filter((pair) => pair.sameSubject).length, 2);
  assert.equal(first.pairs.filter((pair) => !pair.sameSubject).length, 2);

  for (const pair of first.pairs) {
    assert.notEqual(pair.referenceSampleId, pair.probeSampleId);
  }
});

test("summary exposes only counts, authority, and digests", () => {
  const manifest = createDatasetManifest({
    datasetId: "synthetic-face-v0",
    version: "0.1.0",
    authority,
    samples: baseSamples(),
  });

  const summary = summarizeDatasetManifest(manifest);

  assert.equal(summary.sampleCount, 6);
  assert.equal(summary.subjectCount, 3);
  assert.equal(summary.splitCounts.train, 2);
  assert.equal(summary.splitCounts.test, 4);
  assert.equal(summary.authorityBasis, "synthetic");
  assert.equal(summary.productionReady, false);
});

test("test split requires at least two subjects with two samples each", () => {
  const manifest = createDatasetManifest({
    datasetId: "synthetic-face-v0",
    version: "0.1.0",
    authority,
    samples: [
      { sampleId: "train-a-1", subjectId: "train-a", assetRef: "lab://train-a/1", split: "train" },
      { sampleId: "train-a-2", subjectId: "train-a", assetRef: "lab://train-a/2", split: "train" },
      { sampleId: "test-a-1", subjectId: "test-a", assetRef: "lab://test-a/1", split: "test" },
      { sampleId: "test-a-2", subjectId: "test-a", assetRef: "lab://test-a/2", split: "test" },
    ],
  });

  assert.throws(
    () => buildVerificationProtocol({ manifest, split: "test" }),
    (error) => error?.code === "insufficient_evaluation_subjects",
  );
});
