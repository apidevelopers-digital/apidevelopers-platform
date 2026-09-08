import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Mitra Professional preserves the Professional/Office trust boundary", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /Mitra Profissional/);
  assert.match(source, /Sem banco privado no modo Profissional/);
  assert.match(source, /client_id/);
  assert.match(source, /Credenciais de serviço ficam server-side/);
  assert.match(source, /Escritório · Bloco B/);
  assert.doesNotMatch(source, /peterle-ops\.apidevelopers\.digital\/v1\//);
});

test("Professional workspace exposes the five Block A capabilities", () => {
  const workspace = readFileSync(new URL("../src/ProfessionalWorkspace.jsx", import.meta.url), "utf8");
  for (const label of ["Pesquisa", "Assistente", "Jurimetria", "Documentos", "Veritas"]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /credentials only server-side|credenciais somente server-side/i);
});

test("publishing manifest still requires preview and explicit approval", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../publishing-manifest.json", import.meta.url), "utf8"),
  );

  assert.equal(manifest.app, "mitra-public");
  assert.equal(manifest.domain, "mitra.apidevelopers.digital");
  assert.equal(manifest.preview.required, true);
  assert.equal(manifest.approvalPolicy, "explicit-igor-approval");
  assert.deepEqual(manifest.requiredSecrets, []);
});
