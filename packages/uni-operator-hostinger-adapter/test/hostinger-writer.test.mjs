import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createHostingerSafeWriter } from "../src/hostinger-writer.mjs";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "uni-hostinger-writer-"));
  const filePath = path.join(root, "sample.php");
  const content = Buffer.from("<?php\nreturn 'old';\n", "utf8");
  await writeFile(filePath, content);
  return { root, filePath, content };
}

test("writer is disabled by default", async () => {
  const { root, filePath } = await fixture();
  try {
    const writer = createHostingerSafeWriter({ roots: [root] });
    await assert.rejects(
      writer.replaceText({
        path: filePath,
        search: "old",
        replacement: "new",
        expectedSha256: digest(Buffer.from("<?php\nreturn 'old';\n")),
      }),
      /writer_disabled/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("replaceText dry-run is non-mutating and reports sanitized diff", async () => {
  const { root, filePath, content } = await fixture();
  try {
    const writer = createHostingerSafeWriter({ roots: [root], enabled: true });
    const result = await writer.replaceText({
      path: filePath,
      search: "old",
      replacement: "new",
      expectedSha256: digest(content),
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.path, "sample.php");
    assert.equal(result.occurrences, 1);
    assert.equal(result.changed, true);
    assert.equal(result.backupCreated, false);
    assert.equal(await readFile(filePath, "utf8"), content.toString("utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("replaceText requires exact sha and exact occurrence count", async () => {
  const { root, filePath, content } = await fixture();
  try {
    const writer = createHostingerSafeWriter({ roots: [root], enabled: true });

    await assert.rejects(
      writer.replaceText({
        path: filePath,
        search: "old",
        replacement: "new",
        expectedSha256: "0".repeat(64),
      }),
      /sha256_mismatch/,
    );

    await assert.rejects(
      writer.replaceText({
        path: filePath,
        search: "missing",
        replacement: "new",
        expectedSha256: digest(content),
      }),
      /occurrence_count_mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("replaceText performs backup and atomic replacement", async () => {
  const { root, filePath, content } = await fixture();
  try {
    const writer = createHostingerSafeWriter({
      roots: [root],
      enabled: true,
      now: () => new Date("2026-08-04T07:00:00.000Z"),
    });
    const result = await writer.replaceText({
      path: filePath,
      search: "old",
      replacement: "new",
      expectedSha256: digest(content),
      dryRun: false,
    });

    assert.equal(result.dryRun, false);
    assert.equal(result.backupCreated, true);
    assert.equal(result.atomic, true);
    assert.equal(await readFile(filePath, "utf8"), "<?php\nreturn 'new';\n");
    assert.equal(
      await readFile(path.join(root, result.backupPath), "utf8"),
      content.toString("utf8"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeBase64 creates a new file only with create=true", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uni-hostinger-writer-"));
  const filePath = path.join(root, "new.php");
  const content = Buffer.from("<?php\nreturn 'safe';\n", "utf8");
  try {
    const writer = createHostingerSafeWriter({ roots: [root], enabled: true });

    await assert.rejects(
      writer.writeBase64({
        path: filePath,
        base64: content.toString("base64"),
        dryRun: false,
      }),
      /target_missing/,
    );

    const result = await writer.writeBase64({
      path: filePath,
      base64: content.toString("base64"),
      dryRun: false,
      create: true,
    });

    assert.equal(result.existed, false);
    assert.equal(result.afterSha256, digest(content));
    assert.equal(await readFile(filePath, "utf8"), content.toString("utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeBase64 rejects malformed base64 and secret-like content", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uni-hostinger-writer-"));
  try {
    const writer = createHostingerSafeWriter({ roots: [root], enabled: true });

    await assert.rejects(
      writer.writeBase64({
        path: path.join(root, "bad.php"),
        base64: "not-base64",
        create: true,
      }),
      /base64_invalid/,
    );

    const secret = Buffer.from("token=abcdefghijklmnop1234567890", "utf8");
    await assert.rejects(
      writer.writeBase64({
        path: path.join(root, "secret.php"),
        base64: secret.toString("base64"),
        create: true,
      }),
      /secret_like_content_blocked/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("paths outside allowed roots are blocked", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uni-hostinger-writer-"));
  try {
    const writer = createHostingerSafeWriter({ roots: [root], enabled: true });
    await assert.rejects(
      writer.writeBase64({
        path: path.join(os.tmpdir(), "outside.php"),
        base64: Buffer.from("safe").toString("base64"),
        create: true,
      }),
      /path_not_allowed/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
