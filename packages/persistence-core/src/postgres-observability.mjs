const DEFAULTS = Object.freeze({
  waiting: 1,
  utilization: 0.9,
  p95Ms: 250,
  errorRate: 0.05,
  minLatencySamples: 10,
  minErrorSamples: 20,
});

function positive(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function ratio(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${name} must be between 0 and 1`);
  return value;
}

function nonNegative(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be non-negative`);
  return value;
}

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, freeze(entry)])));
  }
  return value;
}

function commandOf(query) {
  const text = typeof query === "string" ? query : query?.text ?? "";
  return (/^\s*([a-z]+)/iu.exec(text)?.[1] ?? "unknown").toLowerCase();
}

function errorCode(error) {
  return String(error?.code ?? error?.name ?? "unknown").slice(0, 64);
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function newMetric() {
  return { total: 0, ok: 0, failed: 0, sum: 0, min: null, max: 0, samples: [] };
}

function metricSnapshot(metric) {
  return freeze({
    total: metric.total,
    succeeded: metric.ok,
    failed: metric.failed,
    errorRate: metric.total ? metric.failed / metric.total : 0,
    latencyMs: {
      average: metric.total ? metric.sum / metric.total : 0,
      minimum: metric.min ?? 0,
      maximum: metric.max,
      p95: percentile(metric.samples, 0.95),
      samples: metric.samples.length,
    },
  });
}

function poolSnapshot(pool) {
  const max = Number(pool.options?.max ?? 10);
  const total = Number(pool.totalCount ?? 0);
  const idle = Number(pool.idleCount ?? 0);
  const waiting = Number(pool.waitingCount ?? 0);
  const active = Math.max(0, total - idle);
  return freeze({
    max,
    total,
    active,
    idle,
    waiting,
    utilization: max > 0 ? active / max : 0,
    saturated: waiting > 0 || active >= max,
  });
}

export function createPostgresObservability({
  pool,
  thresholds = {},
  sampleLimit = 256,
  alertRetention = 256,
  clock = () => Number(process.hrtime.bigint()) / 1e6,
  timestamp = () => new Date().toISOString(),
  alertSink = () => {},
} = {}) {
  if (!pool || typeof pool.connect !== "function" || typeof pool.query !== "function") {
    throw new TypeError("pool must provide connect and query");
  }
  positive(sampleLimit, "sampleLimit");
  positive(alertRetention, "alertRetention");

  const limits = freeze({
    waiting: positive(thresholds.waiting ?? DEFAULTS.waiting, "thresholds.waiting"),
    utilization: ratio(thresholds.utilization ?? DEFAULTS.utilization, "thresholds.utilization"),
    p95Ms: nonNegative(thresholds.p95Ms ?? DEFAULTS.p95Ms, "thresholds.p95Ms"),
    errorRate: ratio(thresholds.errorRate ?? DEFAULTS.errorRate, "thresholds.errorRate"),
    minLatencySamples: positive(thresholds.minLatencySamples ?? DEFAULTS.minLatencySamples, "thresholds.minLatencySamples"),
    minErrorSamples: positive(thresholds.minErrorSamples ?? DEFAULTS.minErrorSamples, "thresholds.minErrorSamples"),
  });

  const metrics = { connect: newMetric(), query: newMetric() };
  const commands = new Map();
  const errors = new Map();
  const activeAlerts = new Map();
  const events = [];
  let sequence = 0;
  let sinkFailures = 0;
  let poolErrors = 0;

  function emit(code, severity, status, value, threshold, details = {}) {
    const event = freeze({
      id: `${code}:${++sequence}`,
      code,
      severity,
      status,
      observedAt: timestamp(),
      value,
      threshold,
      details,
    });
    events.push(event);
    if (events.length > alertRetention) events.splice(0, events.length - alertRetention);
    try { alertSink(event); } catch { sinkFailures += 1; }
  }

  function transition(code, on, severity, value, threshold, details) {
    const current = activeAlerts.get(code);
    if (on) {
      activeAlerts.set(code, freeze({
        code,
        severity,
        openedAt: current?.openedAt ?? timestamp(),
        value,
        threshold,
        details,
      }));
      if (!current) emit(code, severity, "opened", value, threshold, details);
    } else if (current) {
      activeAlerts.delete(code);
      emit(code, current.severity, "resolved", value, current.threshold, details);
    }
  }

  function evaluate() {
    const currentPool = poolSnapshot(pool);
    const query = metricSnapshot(metrics.query);
    transition("postgres_pool_waiting", currentPool.waiting >= limits.waiting, "warning", currentPool.waiting, limits.waiting, currentPool);
    transition("postgres_pool_utilization", currentPool.utilization >= limits.utilization, "warning", currentPool.utilization, limits.utilization, currentPool);
    transition(
      "postgres_query_latency_p95",
      query.total >= limits.minLatencySamples && query.latencyMs.p95 >= limits.p95Ms,
      "warning",
      query.latencyMs.p95,
      limits.p95Ms,
      { samples: query.latencyMs.samples, unit: "ms" },
    );
    transition(
      "postgres_query_error_rate",
      query.total >= limits.minErrorSamples && query.errorRate >= limits.errorRate,
      "critical",
      query.errorRate,
      limits.errorRate,
      { total: query.total, failed: query.failed },
    );
  }

  function record(metric, duration, error, countError = true) {
    metric.total += 1;
    if (error) {
      metric.failed += 1;
      if (countError) errors.set(errorCode(error), (errors.get(errorCode(error)) ?? 0) + 1);
    } else {
      metric.ok += 1;
    }
    const value = Math.max(0, duration);
    metric.sum += value;
    metric.min = metric.min === null ? value : Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    metric.samples.push(value);
    if (metric.samples.length > sampleLimit) metric.samples.shift();
  }

  async function observedQuery(target, args) {
    const started = clock();
    const command = commandOf(args[0]);
    let failure = null;
    try {
      return await target.query(...args);
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      const duration = clock() - started;
      record(metrics.query, duration, failure);
      const commandMetric = commands.get(command) ?? newMetric();
      record(commandMetric, duration, failure, false);
      commands.set(command, commandMetric);
      evaluate();
    }
  }

  function wrapClient(client) {
    return new Proxy(client, {
      get(target, property) {
        if (property === "query") return (...args) => observedQuery(target, args);
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  async function observedConnect(...args) {
    const started = clock();
    let failure = null;
    try {
      return wrapClient(await pool.connect(...args));
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      record(metrics.connect, clock() - started, failure);
      evaluate();
    }
  }

  const observedPool = new Proxy(pool, {
    get(target, property) {
      if (property === "connect") return observedConnect;
      if (property === "query") return (...args) => observedQuery(target, args);
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  function onPoolError(error) {
    poolErrors += 1;
    errors.set(errorCode(error), (errors.get(errorCode(error)) ?? 0) + 1);
    emit("postgres_pool_error", "critical", "observed", errorCode(error), 0);
  }
  pool.on?.("error", onPoolError);

  function snapshot() {
    evaluate();
    return freeze({
      generatedAt: timestamp(),
      pool: poolSnapshot(pool),
      operations: {
        connect: metricSnapshot(metrics.connect),
        query: metricSnapshot(metrics.query),
      },
      queries: {
        byCommand: Object.fromEntries(
          [...commands.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, metric]) => [name, metricSnapshot(metric)]),
        ),
      },
      errors: {
        total: metrics.connect.failed + metrics.query.failed + poolErrors,
        pool: poolErrors,
        byCode: Object.fromEntries([...errors.entries()].sort(([a], [b]) => a.localeCompare(b))),
      },
      alerts: {
        active: [...activeAlerts.values()],
        retainedEvents: events.length,
        sinkFailures,
      },
      thresholds: limits,
    });
  }

  function listAlertEvents({ limit = 100 } = {}) {
    positive(limit, "limit");
    return freeze(events.slice(-limit).reverse());
  }

  function close() {
    pool.off?.("error", onPoolError);
  }

  return Object.freeze({ pool: observedPool, snapshot, listAlertEvents, close });
}
