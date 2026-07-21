import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadProjections } from "../public/projection-loader.js";

const panelSource = await readFile(new URL("../public/observability-panel.js", import.meta.url), "utf8");
const accessibilitySource = await readFile(new URL("../public/accessibility.js", import.meta.url), "utf8");

assert.match(accessibilitySource, /observability-panel\.js/);
assert.match(panelSource, /portal:observability/);
assert.match(panelSource, /traceabilityPanel/);
assert.match(panelSource, /textContent/);
assert.doesNotMatch(panelSource, /innerHTML/);
assert.doesNotMatch(panelSource, /fetch\(|sendBeacon|XMLHttpRequest|WebSocket|localStorage|sessionStorage/);

const originalCustomEvent = globalThis.CustomEvent;
const originalDispatchEvent = globalThis.dispatchEvent;
let published = null;

try {
  globalThis.CustomEvent = class {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.dispatchEvent = (event) => {
    published = event;
    return true;
  };

  const result = await loadProjections({
    institutionalSnapshot: async () => ({
      records: [],
      meta: { correlationId: "inst-001" },
    }),
    learningSnapshot: async () => ({
      memories: [],
      meta: { correlationId: "learning-002" },
    }),
  });

  assert.equal(published.type, "portal:observability");
  assert.deepEqual(published.detail.summary, result.observability);
  assert.deepEqual(published.detail.metrics, result.metrics);
  assert.equal(published.detail.metrics[0].correlationId, "inst-001");
  assert.equal(published.detail.metrics[1].correlationId, "learning-002");
} finally {
  globalThis.CustomEvent = originalCustomEvent;
  globalThis.dispatchEvent = originalDispatchEvent;
}

console.log("developer-portal observability panel integration: ok");
