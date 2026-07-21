import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts", "check-workspace-manifests.mjs");

async function fixture(packages) {
  const root = await mkdtemp(path.join(tmpdir(), "workspace-check-"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    private: true,
    workspaces: ["packages/*"],
  }));
  for (const [directory, manifest] of Object.entries(packages)) {
    const target = path.join(root, "packages", directory);
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "package.json"), JSON.stringify(manifest));
  }
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [SCRIPT, "--root", root], {
    encoding: "utf8",
  });
}

test("accepts explicit local dependency versions", async () => {
  const root = await fixture({
    contracts: { name: "@apidevelopers/contracts", version: "0.1.0" },
    memory: {
      name: "@apidevelopers/kernel-memory",
      version: "0.1.0",
      dependencies: { "@apidevelopers/contracts": "0.1.0" },
    },
  });
  const result = run(root);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /"workspaceCount": 2/);
});

test("rejects npm-incompatible workspace protocol", async () => {
  const root = await fixture({
    contracts: { name: "@apidevelopers/contracts", version: "0.1.0" },
    memory: {
      name: "@apidevelopers/kernel-memory",
      version: "0.1.0",
      dependencies: { "@apidevelopers/contracts": "workspace:*" },
    },
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /WORKSPACE_PROTOCOL_UNSUPPORTED/);
});

test("rejects duplicate package names", async () => {
  const root = await fixture({
    first: { name: "@apidevelopers/duplicate", version: "0.1.0" },
    second: { name: "@apidevelopers/duplicate", version: "0.1.0" },
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DUPLICATE_PACKAGE_NAME/);
});
