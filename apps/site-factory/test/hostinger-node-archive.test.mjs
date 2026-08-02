import test from "node:test";
import assert from "node:assert/strict";

import {
  createHostingerNodeArchivePlan,
  MAX_ARCHIVE_BYTES,
  REQUIRED_FILES,
} from "../src/hostinger-node-archive.mjs";

const sourceSha = "6c63689c3a5680719e69d758fe5ed2144a9b6b79";
const baseInput = {
  sourceRepository: "apidevelopers-digital/apidevelopers-platform",
  sourceSha,
  sourceRunId: "30736671758",
  archiveName: `site-factory-hostinger-node-source-${sourceSha}.zip`,
  archiveSha256:
    "dc8108381e8478e83bdc3de1b9e5a8fbe1f74a69b84c1fc3ffd6bd4ca711cf0a",
  archiveBytes: 4096,
  archiveFiles: [...REQUIRED_FILES],
  targetDomain: "preview-apidevelopers.apidevelopers.digital",
  generatedAt: "2026-08-02T07:30:00.000Z",
};

test("creates a deterministic dry-run archive plan", () => {
  const first = createHostingerNodeArchivePlan(baseInput);
  const second = createHostingerNodeArchivePlan(baseInput);

  assert.equal(first.mode, "dry-run");
  assert.equal(first.readyForApply, false);
  assert.equal(first.writesEnabled, false);
  assert.equal(first.deployEnabled, false);
  assert.equal(first.dnsEnabled, false);
  assert.equal(first.hostingerWriteExecuted, false);
  assert.equal(first.target.domain, baseInput.targetDomain);
  assert.equal(first.archive.maximumBytes, MAX_ARCHIVE_BYTES);
  assert.equal(first.fingerprint, second.fingerprint);
});

test("rejects archives containing dependency or build output directories", () => {
  for (const forbidden of [
    "node_modules/react/index.js",
    "dist/index.html",
    "build/app.js",
    ".next/server.js",
  ]) {
    assert.throws(
      () =>
        createHostingerNodeArchivePlan({
          ...baseInput,
          archiveFiles: [...REQUIRED_FILES, forbidden],
        }),
      /forbidden_archive_path/,
    );
  }
});

test("rejects archives containing environment files or private keys", () => {
  for (const forbidden of [".env", ".env.production", "private.pem", "id_rsa"]) {
    assert.throws(
      () =>
        createHostingerNodeArchivePlan({
          ...baseInput,
          archiveFiles: [...REQUIRED_FILES, forbidden],
        }),
      /forbidden_archive_path/,
    );
  }
});

test("rejects archives larger than the Hostinger 50MB limit", () => {
  assert.throws(
    () =>
      createHostingerNodeArchivePlan({
        ...baseInput,
        archiveBytes: MAX_ARCHIVE_BYTES + 1,
      }),
    /archive_exceeds_50mb_limit/,
  );
});

test("rejects archive names that are not pinned to the source SHA", () => {
  assert.throws(
    () =>
      createHostingerNodeArchivePlan({
        ...baseInput,
        archiveName: "site-factory-hostinger-node-source-wrong.zip",
      }),
    /archive_name_sha_mismatch/,
  );
});
