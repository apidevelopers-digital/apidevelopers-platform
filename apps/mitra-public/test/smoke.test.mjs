import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Mitra public preview preserves public/private boundary", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /Sem banco privado no modo público/);
  assert.match(source, /Autenticação real não está habilitada/);
  assert.doesNotMatch(source, /peterle-ops\.apidevelopers\.digital\/v1\//);
});

test("publishing manifest requires preview and explicit approval", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../publishing-manifest.json", import.meta.url), "utf8"),
  );

  assert.equal(manifest.app, "mitra-public");
  assert.equal(manifest.domain, "mitra.apidevelopers.digital");
  assert.equal(manifest.preview.required, true);
  assert.equal(manifest.approvalPolicy, "explicit-igor-approval");
  assert.deepEqual(manifest.requiredSecrets, []);
});
