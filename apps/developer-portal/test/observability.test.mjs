import assert from "node:assert/strict";
import {
  createMetric,
  sanitizeCorrelationId,
  summarizeMetrics,
} from "../public/observability.js";
import { loadProjections } from "../public/projection-loader.js";

assert.equal(sanitizeCorrelationId("abc-123_DEF"), "abc-123_DEF");
assert.equal(sanitizeCorrelationId(" bearer secret "), null);
assert.equal(sanitizeCorrelationId("x".repeat(65)), null);
assert.equal(sanitizeCorrelationId(null), null);

const metric = createMetric({
  name: "institutional",
  startedAt: 10,
  endedAt: 22.345,
  ok: true,
  status: 200,
  correlationId: "corr-01",
});
assert.deepEqual(metric, {
  name: "institutional",
  durationMs: 12.35,
  ok: true,
  status: 200,
  code: null,
  retryable: false,
  correlationId: "corr-01",
});

assert.deepEqual(summarizeMetrics([
  metric,
  createMetric({
    name: "learning",
    startedAt: 20,
    endedAt: 25,
    ok: false,
    status: 503,
    code: "UPSTREAM_UNAVAILABLE",
    retryable: true,
    correlationId: "unsafe value with spaces",
  }),
]), {
  count: 2,
  successes: 1,
  failures: 1,
  durationMs: 17.35,
});

const result = await loadProjections({
  institutionalSnapshot: async () => ({
    records: [],
    meta: { correlationId: "inst-001" },
  }),
  learningSnapshot: async () => {
    const error = new Error("UPSTREAM_UNAVAILABLE");
    error.status = 503;
    error.retryable = true;
    error.payload = { meta: { correlationId: "learn-002" } };
    throw error;
  },
});

assert.equal(result.metrics.length, 2);
assert.equal(result.institutional.metric.ok, true);
assert.equal(result.institutional.metric.correlationId, "inst-001");
assert.equal(result.learning.metric.ok, false);
assert.equal(result.learning.metric.status, 503);
assert.equal(result.learning.metric.retryable, true);
assert.equal(result.learning.metric.correlationId, "learn-002");
assert.deepEqual(result.observability, {
  count: 2,
  successes: 1,
  failures: 1,
  durationMs: Math.round((result.metrics[0].durationMs + result.metrics[1].durationMs) * 100) / 100,
});

console.log("developer-portal local observability contracts: ok");
