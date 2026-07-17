import test from "node:test";
import assert from "node:assert/strict";

import * as official from "../src/index.mjs";
import * as legacy from "../../../scripts/lib/reflection-engine.mjs";

test("legacy reflection import reexports the canonical package API", () => {
  assert.deepEqual(Object.keys(legacy).sort(), Object.keys(official).sort());
  assert.strictEqual(legacy.ReflectionEngine, official.ReflectionEngine);
  assert.strictEqual(legacy.createReflectionEngine, official.createReflectionEngine);
  assert.strictEqual(legacy.reflectionRules, official.reflectionRules);
});
