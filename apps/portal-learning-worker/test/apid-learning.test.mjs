import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(currentDir, "../../..");
const cliPath = path.join(root, "scripts/apid.mjs");

test("apid help exposes the supervised learning command", () => {
  const result = spawnSync(process.execPath, [cliPath, "help"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /learning/);
  assert.match(result.stdout, /snapshot/);
  assert.match(result.stdout, /somente leitura/);
});

test("apid learning dispatches to the integrated cycle without weakening publish gates", async () => {
  const source = await readFile(cliPath, "utf8");

  assert.match(
    source,
    /learning:\s*\{[\s\S]*script:\s*"apps\/portal-learning-worker\/src\/integrated-cycle\.mjs"/,
  );
  assert.match(source, /PUBLISH_GITHUB_FILE_REAL/);
  assert.match(source, /command === "publish"/);
  assert.doesNotMatch(source, /command === "learning"[\s\S]*PUBLISH_GITHUB_FILE_REAL/);
});
