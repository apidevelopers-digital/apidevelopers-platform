import test from "node:test";
import assert from "node:assert/strict";

import { pluginCapabilities } from "../src/plugin-gateway.mjs";

test("ada-juri macroplugin exposes expanded legal operation catalog", () => {
  const result = pluginCapabilities("juri");

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.id, "juri");
  assert.ok(result.payload.operations.length >= 60);
  assert.ok(result.payload.operations.includes("peterle.matters.evidence_pack"));
  assert.ok(result.payload.operations.includes("peterle.legal.jurisprudence.search"));
  assert.ok(result.payload.operations.includes("mitra.db.matters.audit"));
  assert.ok(result.payload.operations.includes("juri.hearing.questions"));
});
