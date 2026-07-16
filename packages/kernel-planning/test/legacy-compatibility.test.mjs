import test from "node:test";
import assert from "node:assert/strict";

import * as official from "../src/index.mjs";
import * as legacy from "../../../scripts/lib/planning-engine.mjs";

test("legacy planning import reexports the canonical package API", () => {
  assert.deepEqual(Object.keys(legacy).sort(), Object.keys(official).sort());
  assert.strictEqual(legacy.PlanningEngine, official.PlanningEngine);
  assert.strictEqual(legacy.createPlanningEngine, official.createPlanningEngine);
  assert.strictEqual(legacy.planningPriorities, official.planningPriorities);
});
