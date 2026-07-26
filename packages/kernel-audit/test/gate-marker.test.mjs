import test from "node:test";
import assert from "node:assert/strict";
import { auditRules } from "../src/index.mjs";

test("emits the institutional functional marker", () => {
  assert.equal(Object.keys(auditRules).length, 5);
  console.log("KERNEL_AUDIT_GATE_OK");
});
