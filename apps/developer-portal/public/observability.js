const SAFE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export function now() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function sanitizeCorrelationId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return SAFE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function createMetric({
  name,
  startedAt,
  endedAt,
  ok,
  status = null,
  code = null,
  retryable = false,
  correlationId = null,
}) {
  const durationMs = Math.max(0, Math.round((endedAt - startedAt) * 100) / 100);
  return {
    name: String(name),
    durationMs,
    ok: Boolean(ok),
    status: Number.isFinite(status) ? status : null,
    code: typeof code === "string" ? code.slice(0, 64) : null,
    retryable: Boolean(retryable),
    correlationId: sanitizeCorrelationId(correlationId),
  };
}

export function summarizeMetrics(metrics) {
  const items = Array.isArray(metrics) ? metrics : [];
  const durationMs = Math.round(items.reduce((sum, item) => sum + (item.durationMs || 0), 0) * 100) / 100;
  return {
    count: items.length,
    successes: items.filter((item) => item.ok).length,
    failures: items.filter((item) => !item.ok).length,
    durationMs,
  };
}
