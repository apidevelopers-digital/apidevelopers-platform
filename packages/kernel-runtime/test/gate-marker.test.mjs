import test from "node:test";
import assert from "node:assert/strict";
import { runtimeModes, runtimeStatuses } from "../src/index.mjs";

test("emits the institutional functional marker", () => {
  assert.equal(runtimeModes.length, 2);
  assert.equal(runtimeStatuses.length, 4);
  console.log("KERNEL_RUNTIME_GATE_OK");
});
