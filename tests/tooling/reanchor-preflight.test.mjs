import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { validateWorkspace } from "../../scripts/reanchor-preflight.mjs";

function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "reanchor-preflight-"));
}

function writePackage(root, relativePath, manifest) {
  const directory = path.join(root, relativePath);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify(manifest, null, 2),
  );
}

test("accepts repository internal dependency convention", () => {
  const root = fixture();
  writePackage(root, "packages/core-a", {
    name: "@apidevelopers/core-a",
    version: "0.1.0",
  });
  writePackage(root, "packages/core-b", {
    name: "@apidevelopers/core-b",
    version: "0.1.0",
    dependencies: {
      "@apidevelopers/core-a": "*",
    },
  });

  const result = validateWorkspace(root);
  assert.equal(result.ok, true);
  assert.equal(result.packageCount, 2);
});

test("rejects workspace protocol before npm install", () => {
  const root = fixture();
  writePackage(root, "packages/core-a", {
    name: "@apidevelopers/core-a",
    version: "0.1.0",
  });
  writePackage(root, "packages/core-b", {
    name: "@apidevelopers/core-b",
    version: "0.1.0",
    dependencies: {
      "@apidevelopers/core-a": "workspace:*",
    },
  });

  const result = validateWorkspace(root);
  assert.equal(result.ok, false);
  assert.equal(
    result.errors.some((error) => error.code === "PREFLIGHT_UNSUPPORTED_WORKSPACE_PROTOCOL"),
    true,
  );
});

test("rejects missing internal packages", () => {
  const root = fixture();
  writePackage(root, "packages/core-b", {
    name: "@apidevelopers/core-b",
    version: "0.1.0",
    dependencies: {
      "@apidevelopers/missing-core": "*",
    },
  });

  const result = validateWorkspace(root);
  assert.equal(result.ok, false);
  assert.equal(
    result.errors.some((error) => error.code === "PREFLIGHT_INTERNAL_DEPENDENCY_MISSING"),
    true,
  );
});
