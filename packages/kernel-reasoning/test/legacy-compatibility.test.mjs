import test from "node:test";
import assert from "node:assert/strict";

import * as official from "../src/index.mjs";
import * as legacy from "../../../scripts/lib/reasoning-engine.mjs";

test("legacy reasoning import reexports the canonical package API", () => {
  assert.deepEqual(
    Object.keys(legacy).sort(),
    Object.keys(official).sort(),
  );
  assert.strictEqual(legacy.ReasoningEngine, official.ReasoningEngine);
  assert.strictEqual(
    legacy.createReasoningEngine,
    official.createReasoningEngine,
  );
});
