import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("apid routes architecture validate help without executing validation", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/apid.mjs", "architecture", "validate", "--help"],
    { cwd: ROOT, encoding: "utf8" },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /apid architecture validate/);
  assert.equal(result.stderr, "");
});

test("apid rejects unsupported architecture subcommands", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/apid.mjs", "architecture", "unknown"],
    { cwd: ROOT, encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Subcomando de architecture desconhecido/);
});
