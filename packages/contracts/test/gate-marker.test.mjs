import test from "node:test";
import assert from "node:assert/strict";

import * as contracts from "../src/index.mjs";

test("exports the institutional contracts gate", () => {
  assert.equal(typeof contracts.validateCanonicalId, "function");
  assert.equal(typeof contracts.createTenantContext, "function");
  assert.equal(typeof contracts.createEventEnvelope, "function");
  assert.equal(typeof contracts.createPolicyRuntimeHandoff, "function");
  console.log("APIDEVELOPERS_CONTRACTS_GATE_OK");
});
