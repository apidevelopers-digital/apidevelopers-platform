import { createMetric, now, summarizeMetrics } from "./observability.js";

export async function loadProjections(client, { signal } = {}) {
  const started = {
    institutional: now(),
    learning: now(),
  };

  const [institutional, learning] = await Promise.allSettled([
    client.institutionalSnapshot({ signal }),
    client.learningSnapshot({ signal }),
  ]);

  const result = {
    institutional: toProjectionResult("institutional", institutional, started.institutional),
    learning: toProjectionResult("learning", learning, started.learning),
  };

  result.summary = summarize(result);
  result.metrics = [
    result.institutional.metric,
    result.learning.metric,
  ];
  result.observability = summarizeMetrics(result.metrics);
  return result;
}

function toProjectionResult(name, settled, startedAt) {
  const endedAt = now();

  if (settled.status === "fulfilled") {
    const data = settled.value;
    const correlationId = data?.meta?.correlationId ?? null;
    return {
      name,
      ok: true,
      data,
      error: null,
      metric: createMetric({
        name,
        startedAt,
        endedAt,
        ok: true,
        status: 200,
        correlationId,
      }),
    };
  }

  const error = toSafeError(settled.reason);
  return {
    name,
    ok: false,
    data: null,
    error,
    metric: createMetric({
      name,
      startedAt,
      endedAt,
      ok: false,
      status: error.status,
      code: error.code,
      retryable: error.retryable,
      correlationId: error.correlationId,
    }),
  };
}

function toSafeError(error) {
  const status = Number.isFinite(error?.status) ? error.status : 500;
  const policy = status === 401 || status === 403;
  const correlationId =
    error?.payload?.meta?.correlationId ??
    error?.payload?.correlationId ??
    null;

  return {
    code: String(error?.message || "PROJECTION_UNAVAILABLE").slice(0, 64),
    status,
    retryable: policy ? false : error?.retryable !== false,
    policy,
    correlationId,
  };
}

function summarize(result) {
  const successes = [result.institutional, result.learning].filter((entry) => entry.ok).length;
  if (successes === 2) return { kind: "ready", successes, failures: 0 };
  if (successes === 1) return { kind: "partial", successes, failures: 1 };
  const policyOnly = [result.institutional, result.learning].every((entry) => entry.error?.policy);
  return { kind: policyOnly ? "policy" : "error", successes: 0, failures: 2 };
}
