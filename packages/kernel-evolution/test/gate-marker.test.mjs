import test from "node:test";
import assert from "node:assert/strict";
import { evolutionActions, evolutionStatuses } from "../src/index.mjs";

test("emits the institutional functional marker", () => {
  assert.equal(evolutionStatuses.length, 3);
  assert.equal(evolutionActions.length, 3);
  console.log("KERNEL_EVOLUTION_GATE_OK");
});
