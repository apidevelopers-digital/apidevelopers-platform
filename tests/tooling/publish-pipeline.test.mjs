import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const validator = join(root, "scripts", "validate-publish-file.mjs");
const publisher = join(root, "scripts", "publish-github-file.mjs");

function runNode(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("validator accepts valid JSON and confirms Base64 round-trip", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ap-publish-"));
  const file = join(dir, "valid.json");
  try {
    await writeFile(file, JSON.stringify({ ok: true }, null, 2));
    const result = runNode(validator, ["--file", file]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.roundTripValidated, true);
    assert.equal(report.jsonValidated, true);
    assert.match(report.sha256, /^[a-f0-9]{64}$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validator rejects empty files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ap-publish-"));
  const file = join(dir, "empty.md");
  try {
    await writeFile(file, "");
    const result = runNode(validator, ["--file", file]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /empty/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validator rejects invalid JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ap-publish-"));
  const file = join(dir, "invalid.json");
  try {
    await writeFile(file, '{"broken":');
    const result = runNode(validator, ["--file", file]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unexpected|JSON/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("publisher enforces explicit confirmation and post-publish verification", async () => {
  const source = await readFile(publisher, "utf8");
  assert.match(source, /PUBLISH_GITHUB_FILE_REAL/);
  assert.match(source, /mode:\s*"dry-run"/);
  assert.match(source, /verifyPublished/);
  assert.match(source, /Post-publish digest mismatch/);
});
