import assert from "node:assert/strict";
import test from "node:test";

import {
  MITRA_MCP_V1_BACKENDS,
  MITRA_MCP_V1_ERROR_CODES,
  MITRA_MCP_V1_SAFETY,
  createMitraMcpV1ContractSummary,
  getMitraMcpV1Tool,
  listMitraMcpV1Scopes,
  listMitraMcpV1Tools,
} from "../src/mitra-mcp-v1-contract.mjs";

test("Mitra MCP v1 exposes the initial tool registry without duplicating backend roles", () => {
  const tools = listMitraMcpV1Tools();

  assert.deepEqual(
    tools.map((item) => item.name),
    [
      "mitra.status",
      "mitra.capabilities",
      "mitra.buscar_jurisprudencia",
      "mitra.pesquisar_fontes_oficiais",
      "mitra.buscar_processo",
      "mitra.contexto_cliente",
      "mitra.analisar_caso",
      "mitra.analisar_documento",
      "mitra.gerar_tese",
      "mitra.gerar_minuta",
      "mitra.veritas",
    ],
  );

  assert.equal(getMitraMcpV1Tool("mitra.buscar_jurisprudencia").backend, MITRA_MCP_V1_BACKENDS.LEX_LEGAL_API);
  assert.equal(getMitraMcpV1Tool("mitra.pesquisar_fontes_oficiais").backend, MITRA_MCP_V1_BACKENDS.LEX_LEGAL_API);
  assert.equal(getMitraMcpV1Tool("mitra.buscar_processo").backend, MITRA_MCP_V1_BACKENDS.LEX_LEGAL_API);
  assert.equal(getMitraMcpV1Tool("mitra.analisar_caso").backend, MITRA_MCP_V1_BACKENDS.MITRA_LEGAL_ORCHESTRATOR);
  assert.equal(getMitraMcpV1Tool("mitra.status").backend, MITRA_MCP_V1_BACKENDS.ADA_GATEWAY);
});

test("Mitra MCP v1 tools declare scopes, schemas and secret-safe defaults", () => {
  for (const item of listMitraMcpV1Tools()) {
    assert.equal(item.mutatesState, false);
    assert.equal(item.destructive, false);
    assert.equal(item.secretsReturned, false);
    assert.ok(item.requiredScope.startsWith("mitra:"));
    assert.equal(item.inputSchema.type, "object");
    assert.equal(item.outputSchema.type, "object");
  }

  assert.equal(MITRA_MCP_V1_SAFETY.secretsNeverReturned, true);
  assert.equal(MITRA_MCP_V1_SAFETY.noAutonomousLegalAct, true);
  assert.equal(MITRA_MCP_V1_SAFETY.noParallelJurisprudenceBackend, true);
});

test("Mitra MCP v1 assisted legal tools require human review", () => {
  for (const name of [
    "mitra.analisar_caso",
    "mitra.analisar_documento",
    "mitra.gerar_tese",
    "mitra.gerar_minuta",
    "mitra.veritas",
  ]) {
    const tool = getMitraMcpV1Tool(name);
    assert.equal(tool.humanReviewRequired, true);
    assert.match(tool.risk, /^R2_/);
  }
});

test("Mitra MCP v1 contract summary is deterministic and auditable", () => {
  const summary = createMitraMcpV1ContractSummary();

  assert.equal(summary.ok, true);
  assert.equal(summary.service, "mitra-mcp");
  assert.equal(summary.toolCount, 11);
  assert.equal(summary.tools.includes("mitra.buscar_jurisprudencia"), true);
  assert.deepEqual(summary.scopes, listMitraMcpV1Scopes());
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(MITRA_MCP_V1_ERROR_CODES.includes("insufficient_scope"), true);
  assert.equal(MITRA_MCP_V1_ERROR_CODES.includes("human_review_required"), true);
});
