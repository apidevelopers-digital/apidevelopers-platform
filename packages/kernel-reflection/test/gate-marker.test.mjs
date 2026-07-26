import test from "node:test";
import assert from "node:assert/strict";

import { reflectionRules } from "../src/index.mjs";

test("emits the institutional functional marker", () => {
  assert.equal(Object.keys(reflectionRules).length, 4);
  console.log("KERNEL_REFLECTION_GATE_OK");
});
