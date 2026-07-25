const DEFAULT_THRESHOLDS = Object.freeze({
  waiting: 1,
  utilization: 0.9,
  p95Ms: 250,
  errorRate: 0.05,
  minLatencySamples: 10,
  minErrorSamples: 20,
});

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function ratio(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${name} must be between 0 and 1`);
  }
  return value;
}

function nonNegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be non-negative`);
  }
  return value;
}

function freeze(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freeze));
  }
  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, freeze(entry)]),
      ),
    );
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
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(ordered.length * fraction) - 1),
  );
  return ordered[index];
}

function newMetric() {
  return {
    total: 0,
    succeeded: 0,
    failed: 0,
    sumMs: 0,
    minimumMs: null,
    maximumMs: 0,
    samples: [],
  };
}

function recordMetric(metric, durationMs, error, sampleLimit) {
  const duration = Math.max(0, Number(durationMs) || 0);
  metric.total += 1;
  if (error) metric.failed += 1;
  else metric.succeeded += 1;
  metric.sumMs += duration;
  metric.minimumMs =
    metric.minimumMs === null ? duration : Math.min(metric.minimumMs, duration);
  metric.maximumMs = Math.max(metric.maximumMs, duration);
  metric.samples.push(duration);
  if (metric.samples.length > sampleLimit) metric.samples.shift();
}

function metricSnapshot(metric) {
  return freeze({
    total: metric.total,
    succeeded: metric.succeeded,
    failed: metric.failed,
    errorRate: metric.total === 0 ? 0 : metric.failed / metric.total,
    latencyMs: {
      average: metric.total === 0 ? 0 : metric.sumMs / metric.total,
      minimum: metric.minimumMs ?? 0,
      maximum: metric.maximumMs,
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
    saturated: waiting > 0 || (max > 0 && active >= max),
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
  if (
    !pool ||
    typeof pool.connect !== "function" ||
    typeof pool.query !== "function"
  ) {
    throw new TypeError("pool must provide connect and query");
  }
  if (typeof clock !== "function") throw new TypeError("clock must be a function");
  if (typeof timestamp !== "function") {
    throw new TypeError("timestamp must be a function");
  }
  if (typeof alertSink !== "function") {
    throw new TypeError("alertSink must be a function");
  }

  positiveInteger(sampleLimit, "sampleLimit");
  positiveInteger(alertRetention, "alertRetention");

  const limits = freeze({
    waiting: positiveInteger(
      thresholds.waiting ?? DEFAULT_THRESHOLDS.waiting,
      "thresholds.waiting",
    ),
    utilization: ratio(
      thresholds.utilization ?? DEFAULT_THRESHOLDS.utilization,
      "thresholds.utilization",
    ),
    p95Ms: nonNegative(
      thresholds.p95Ms ?? DEFAULT_THRESHOLDS.p95Ms,
      "thresholds.p95Ms",
    ),
    errorRate: ratio(
      thresholds.errorRate ?? DEFAULT_THRESHOLDS.errorRate,
      "thresholds.errorRate",
    ),
    minLatencySamples: positiveInteger(
      thresholds.minLatencySamples ?? DEFAULT_THRESHOLDS.minLatencySamples,
      "thresholds.minLatencySamples",
    ),
    minErrorSamples: positiveInteger(
      thresholds.minErrorSamples ?? DEFAULT_THRESHOLDS.minErrorSamples,
      "thresholds.minErrorSamples",
    ),
  });

  const metrics = {
    connect: newMetric(),
    query: newMetric(),
  };
  const commands = new Map();
  const errors = new Map();
  const activeAlerts = new Map();
  const alertEvents = [];
  let sequence = 0;
  let poolErrors = 0;
  let sinkFailures = 0;
  let closed = false;

  function deliver(event) {
    try {
      const result = alertSink(event);
      if (result && typeof result.then === "function") {
        result.catch(() => {
          sinkFailures += 1;
        });
      }
    } catch {
      sinkFailures += 1;
    }
  }

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
    alertEvents.push(event);
    if (alertEvents.length > alertRetention) {
      alertEvents.splice(0, alertEvents.length - alertRetention);
    }
    deliver(event);
    return event;
  }

  function transition(code, active, severity, value, threshold, details = {}) {
    const current = activeAlerts.get(code);
    if (active) {
      const next = freeze({
        code,
        severity,
        openedAt: current?.openedAt ?? timestamp(),
        value,
        threshold,
        details,
      });
      activeAlerts.set(code, next);
      if (!current) emit(code, severity, "opened", value, threshold, details);
      return;
    }

    if (current) {
      activeAlerts.delete(code);
      emit(
        code,
        current.severity,
        "resolved",
        value,
        current.threshold,
        details,
      );
    }
  }

  function evaluate() {
    const currentPool = poolSnapshot(pool);
    const query = metricSnapshot(metrics.query);

    transition(
      "postgres_pool_waiting",
      currentPool.waiting >= limits.waiting,
      "warning",
      currentPool.waiting,
      limits.waiting,
      { active: currentPool.active, max: currentPool.max },
    );
    transition(
      "postgres_pool_utilization",
      currentPool.utilization >= limits.utilization,
      "warning",
      currentPool.utilization,
      limits.utilization,
      { active: currentPool.active, max: currentPool.max },
    );
    transition(
      "postgres_query_latency_p95",
      query.total >= limits.minLatencySamples &&
        query.latencyMs.p95 >= limits.p95Ms,
      "warning",
      query.latencyMs.p95,
      limits.p95Ms,
      { samples: query.latencyMs.samples, unit: "ms" },
    );
    transition(
      "postgres_query_error_rate",
      query.total >= limits.minErrorSamples &&
        query.errorRate >= limits.errorRate,
      "critical",
      query.errorRate,
      limits.errorRate,
      { total: query.total, failed: query.failed },
    );
  }

  function recordError(error) {
    const code = errorCode(error);
    errors.set(code, (errors.get(code) ?? 0) + 1);
  }

  async function observeQuery(target, args) {
    const startedAt = clock();
    const command = commandOf(args[0]);
    let failure = null;

    try {
      return await target.query(...args);
    } catch (error) {
      failure = error;
      recordError(error);
      throw error;
    } finally {
      const durationMs = clock() - startedAt;
      recordMetric(metrics.query, durationMs, failure, sampleLimit);

      const commandMetric = commands.get(command) ?? newMetric();
      recordMetric(commandMetric, durationMs, failure, sampleLimit);
      commands.set(command, commandMetric);
      evaluate();
    }
  }

  function wrapClient(client) {
    return new Proxy(client, {
      get(target, property) {
        if (property === "query") {
          return (...args) => observeQuery(target, args);
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  async function observeConnect(...args) {
    const startedAt = clock();
    let failure = null;

    try {
      return wrapClient(await pool.connect(...args));
    } catch (error) {
      failure = error;
      recordError(error);
      throw error;
    } finally {
      recordMetric(metrics.connect, clock() - startedAt, failure, sampleLimit);
      evaluate();
    }
  }

  const observedPool = new Proxy(pool, {
    get(target, property) {
      if (property === "connect") return observeConnect;
      if (property === "query") {
        return (...args) => observeQuery(target, args);
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  function onPoolError(error) {
    poolErrors += 1;
    recordError(error);
    emit(
      "postgres_pool_error",
      "critical",
      "observed",
      errorCode(error),
      null,
    );
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
          [...commands.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([command, metric]) => [command, metricSnapshot(metric)]),
        ),
      },
      errors: {
        total: metrics.connect.failed + metrics.query.failed + poolErrors,
        pool: poolErrors,
        byCode: Object.fromEntries(
          [...errors.entries()].sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
      },
      alerts: {
        active: [...activeAlerts.values()].sort((left, right) =>
          left.code.localeCompare(right.code),
        ),
        retainedEvents: alertEvents.length,
        sinkFailures,
      },
      thresholds: limits,
    });
  }

  function listAlertEvents({ limit = 100 } = {}) {
    positiveInteger(limit, "limit");
    return freeze(alertEvents.slice(-limit).reverse());
  }

  function close() {
    if (closed) return;
    closed = true;
    pool.off?.("error", onPoolError);
  }

  return Object.freeze({
    pool: observedPool,
    snapshot,
    listAlertEvents,
    close,
  });
}
