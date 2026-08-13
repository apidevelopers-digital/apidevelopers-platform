const DEFAULT_POLICY = Object.freeze({
  failureThreshold: 3,
  cooldownMs: 30_000,
  autoKillSwitchAfterOpenCount: 2,
});

const NON_PROVIDER_FAILURE_CODES = new Set([
  "TRUST_PAYMENT_PROVIDER_DISABLED",
  "TRUST_PAYMENT_PROVIDER_KILL_SWITCH",
  "TRUST_PAYMENT_PROVIDER_MODE_BLOCKED",
  "TRUST_PAYMENT_PROVIDER_AMOUNT_LIMIT",
  "TRUST_PAYMENT_PROVIDER_TENANT_RATE_LIMIT",
  "TRUST_PAYMENT_PROVIDER_CONTROL_INVALID_INPUT",
  "TRUST_PAYMENT_PROVIDER_CONTROL_INVALID_POLICY",
]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    fail("TRUST_PAYMENT_PROVIDER_OPERATIONS_INVALID_INPUT", `${name} is required`);
  }
  return normalized;
}

function positiveInteger(value, name, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < min || normalized > max) {
    fail(
      "TRUST_PAYMENT_PROVIDER_OPERATIONS_INVALID_POLICY",
      `${name} must be an integer between ${min} and ${max}`,
    );
  }
  return normalized;
}

function normalizePolicy(input = {}) {
  const merged = { ...DEFAULT_POLICY, ...input };
  return Object.freeze({
    failureThreshold: positiveInteger(merged.failureThreshold, "failureThreshold", { min: 1, max: 20 }),
    cooldownMs: positiveInteger(merged.cooldownMs, "cooldownMs", { min: 100, max: 3_600_000 }),
    autoKillSwitchAfterOpenCount: positiveInteger(
      merged.autoKillSwitchAfterOpenCount,
      "autoKillSwitchAfterOpenCount",
      { min: 1, max: 20 },
    ),
  });
}

function requireControl(control) {
  if (!control || typeof control !== "object" || Array.isArray(control)) {
    fail("TRUST_PAYMENT_PROVIDER_OPERATIONS_INVALID_CONTROL", "control must be an object");
  }
  for (const method of ["authorize", "health", "readiness", "engageKillSwitch", "status"]) {
    if (typeof control[method] !== "function") {
      fail(
        "TRUST_PAYMENT_PROVIDER_OPERATIONS_INVALID_CONTROL",
        `control.${method} must be a function`,
      );
    }
  }
  return control;
}

function normalizeSink(sink, name) {
  if (sink == null) {
    return Object.freeze({ async append() { return true; } });
  }
  if (typeof sink.append !== "function") {
    fail("TRUST_PAYMENT_PROVIDER_OPERATIONS_INVALID_SINK", `${name}.append must be a function`);
  }
  return sink;
}

function safeCode(error) {
  const code = String(error?.code ?? "TRUST_PAYMENT_PROVIDER_UNKNOWN_FAILURE").trim();
  return code || "TRUST_PAYMENT_PROVIDER_UNKNOWN_FAILURE";
}

function isProviderFailure(error) {
  const code = safeCode(error);
  if (NON_PROVIDER_FAILURE_CODES.has(code)) return false;
  if (code === "TRUST_PAYMENT_PROVIDER_TIMEOUT") return true;
  if (error?.retryable === true) return true;
  if (code === "TRUST_PAYMENT_PROVIDER_INVALID_RESPONSE") return true;
  return code.startsWith("TRUST_PAYMENT_PROVIDER_UPSTREAM_");
}

export function createBiometricPaymentProviderOperations({
  control: controlInput,
  telemetrySink: telemetryInput,
  incidentSink: incidentInput,
  policy: policyInput = {},
  nowMs = () => Date.now(),
} = {}) {
  const control = requireControl(controlInput);
  const telemetrySink = normalizeSink(telemetryInput, "telemetrySink");
  const incidentSink = normalizeSink(incidentInput, "incidentSink");
  const policy = normalizePolicy(policyInput);

  let circuitState = "closed";
  let consecutiveFailures = 0;
  let openedUntil = null;
  let openCount = 0;
  let halfOpenProbeInFlight = false;
  let lastErrorCode = null;
  let lastTransitionAt = null;

  const counters = {
    authorizeTotal: 0,
    authorizeSucceeded: 0,
    authorizeFailed: 0,
    authorizeBlocked: 0,
    circuitOpened: 0,
    halfOpenTransitions: 0,
    healthChecks: 0,
    readinessChecks: 0,
    killSwitchEngaged: 0,
  };

  function now() {
    const value = Number(nowMs());
    if (!Number.isFinite(value)) {
      fail("TRUST_PAYMENT_PROVIDER_OPERATIONS_INVALID_CLOCK", "nowMs must return a finite number");
    }
    return value;
  }

  async function emit(type, fields = {}) {
    const event = Object.freeze({
      type,
      version: "1.0.0",
      provider: control.providerName ?? "unknown",
      mode: control.providerMode ?? "unknown",
      circuitState,
    ...fields,
      sensitiveContentIncluded: false,
    });
    await telemetrySink.append(event);
    return event;
  }

  async function incident(type, fields = {}) {
    const event = Object.freeze({
      type,
      version: "1.0.0",
      provider: control.providerName ?? "unknown",
      mode: control.providerMode ?? "unknown",
      circuitState,
      ...fields,
      sensitiveContentIncluded: false,
    });
    await incidentSink.append(event);
    return event;
  }

  function transition(next, at) {
    circuitState = next;
    lastTransitionAt = at;
  }

  async function openCircuit(error, at, correlationId) {
    transition("open", at);
    openedUntil = at + policy.cooldownMs;
    halfOpenProbeInFlight = false;
    openCount += 1;
    counters.circuitOpened += 1;
    lastErrorCode = safeCode(error);

    await incident("trust.payment.provider.circuit_opened", {
      correlationId,
      errorCode: lastErrorCode,
      consecutiveFailures,
      openCount,
      openedUntil,
    });

    if (openCount >= policy.autoKillSwitchAfterOpenCount) {
      control.engageKillSwitch("incident.provider_repeated_failure");
      counters.killSwitchEngaged += 1;
      await incident("trust.payment.provider.kill_switch_engaged", {
        correlationId,
        reason: "incident.provider_repeated_failure",
        openCount,
      });
    }
  }

  async function prepareCircuit(correlationId) {
    const at = now();

    if (circuitState === "open") {
      if (at < openedUntil) {
        counters.authorizeBlocked += 1;
        await emit("trust.payment.provider.authorize_blocked", {
          correlationId,
          reason: "circuit_open",
          openedUntil,
        });
        fail("TRUST_PAYMENT_PROVIDER_CIRCUIT_OPEN", "payment provider circuit is open");
      }
      transition("half_open", at);
      counters.halfOpenTransitions += 1;
      halfOpenProbeInFlight = false;
      await emit("trust.payment.provider.circuit_half_open", {
        correlationId,
        openCount,
      });
    }

    if (circuitState === "half_open") {
      if (halfOpenProbeInFlight) {
        counters.authorizeBlocked += 1;
        await emit("trust.payment.provider.authorize_blocked", {
          correlationId,
          reason: "half_open_probe_in_flight",
        });
        fail(
          "TRUST_PAYMENT_PROVIDER_CIRCUIT_HALF_OPEN_BUSY",
          "payment provider half-open probe is already in flight",
        );
      }
      halfOpenProbeInFlight = true;
    }

    return at;
  }

  async function authorize(request = {}) {
    const correlationId = required(request.correlationId, "request.correlationId");
    counters.authorizeTotal += 1;
    const startedAt = await prepareCircuit(correlationId);
    const wasHalfOpen = circuitState === "half_open";

    try {
      const result = await control.authorize(request);
      counters.authorizeSucceeded += 1;
      consecutiveFailures = 0;
      lastErrorCode = null;

      if (wasHalfOpen) {
        transition("closed", now());
        openedUntil = null;
        halfOpenProbeInFlight = false;
        await emit("trust.payment.provider.circuit_closed", {
          correlationId,
          openCount,
        });
      }

      await emit("trust.payment.provider.authorize_succeeded", {
        correlationId,
        outcome: String(result?.status ?? "unknown"),
        durationMs: Math.max(0, now() - startedAt),
      });

      return result;
    } catch (error) {
      counters.authorizeFailed += 1;
      lastErrorCode = safeCode(error);
      if (wasHalfOpen) halfOpenProbeInFlight = false;

      const providerFailure = isProviderFailure(error);
      if (providerFailure) consecutiveFailures += 1;

      await emit("trust.payment.provider.authorize_failed", {
        correlationId,
        errorCode: lastErrorCode,
        providerFailure,
        consecutiveFailures,
        durationMs: Math.max(0, now() - startedAt),
      });

      if (
        providerFailure
        && (wasHalfOpen || consecutiveFailures >= policy.failureThreshold)
      ) {
        await openCircuit(error, now(), correlationId);
      }

      throw error;
    }
  }

  async function health() {
    counters.healthChecks += 1;
    const result = await control.health();
    await emit("trust.payment.provider.health_checked", {
      outcome: String(result?.status ?? "unknown"),
    });
    return result;
  }

  async function readiness() {
    counters.readinessChecks += 1;
    const result = await control.readiness();
    await emit("trust.payment.provider.readiness_checked", {
      outcome: result?.ready === true ? "ready" : "not_ready",
      reason: result?.reason ? String(result.reason) : null,
    });
    return result;
  }

  function status() {
    const controlStatus = control.status();
    return Object.freeze({
      type: "BiometricPaymentProviderOperationsStatus",
      version: "1.0.0",
      provider: control.providerName ?? "unknown",
      mode: control.providerMode ?? "unknown",
      circuit: Object.freeze({
        state: circuitState,
        consecutiveFailures,
        openCount,
        openedUntil,
        halfOpenProbeInFlight,
        lastErrorCode,
        lastTransitionAt,
      }),
      counters: Object.freeze({ ...counters }),
      control: Object.freeze({
        enabledByPolicy: controlStatus?.enabledByPolicy === true,
        allowedMode: controlStatus?.allowedMode === true,
        killSwitch: controlStatus?.killSwitch === true,
        killReason: controlStatus?.killReason ?? null,
      }),
      sensitiveContentIncluded: false,
    });
  }

  async function resetCircuit(reason = "manual") {
    const normalizedReason = required(reason, "reason");
    const at = now();
    transition("closed", at);
    consecutiveFailures = 0;
    openedUntil = null;
    halfOpenProbeInFlight = false;
    lastErrorCode = null;
    await incident("trust.payment.provider.circuit_reset", {
      reason: normalizedReason,
      openCount,
    });
    return status();
  }

  return Object.freeze({
    policy,
    authorize,
    health,
    readiness,
    status,
    resetCircuit,
  });
}
