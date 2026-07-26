import test from "node:test";
import assert from "node:assert/strict";

import { orchestrationBlockers } from "../src/index.mjs";

test("emits the institutional functional marker", () => {
  assert.equal(orchestrationBlockers.length > 0, true);
  console.log("KERNEL_ORCHESTRATION_GATE_OK");
});
