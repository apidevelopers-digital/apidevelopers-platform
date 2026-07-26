import test from "node:test";
import assert from "node:assert/strict";
import { governanceRules, governanceStatuses } from "../src/index.mjs";

test("emits the institutional functional marker", () => {
  assert.equal(Object.keys(governanceRules).length, 5);
  assert.equal(governanceStatuses.length, 4);
  console.log("KERNEL_GOVERNANCE_GATE_OK");
});
