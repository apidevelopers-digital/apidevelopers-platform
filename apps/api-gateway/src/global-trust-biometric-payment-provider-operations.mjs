
const DEFAULT_POLICY = Object.freeze({
  failureThreshold: 3,
  cooldownMs: 30_000,
  autoKillSwitchAfterOpenCount: 2,
});

const LOCAL_ERROR_CODES = new Set([
  "TRUST_PAYMENT_PROVIDER_DISABLED",
  "TRUST_PAYMENT_PROVIDER_KILL_SWITCH",
  "TRUST_PAYMENT_PROVIDER_MODE_BLOCKED",
  "TRUST_PAYMENT_PROVIDER_AMOUNT_LIMIT",
  "TRUST_PAYMENT_PROVIDER_TENANT_RATE_LIMIT",
  "TRUST_PAYMENT_PROVIDER_CONTROL_INVALID_INPUT",
  "TRUST_PAYMENT_PROVIDER_CONTROL_INVALID_POLICY",
  "TRUST_PAYMENT_PROVIDER_RECONCILIATION_UNAVAILABLE",
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

function boundedInt(value, name, min, max) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < min || normalized > max) {
    fail("TRUST_PAYMENT_PROVIDER_OPERATIONS_INVALID_POLICY", `${name} is invalid`);
  }
  return normalized;
}

function normalizePolicy(input = {}) {
  const merged = { ...DEFAULT_POLICY, ...input };
  return Object.freeze({
    failureThreshold: boundedInt(merged.failureThreshold, "failureThreshold", 1, 20),
    cooldownMs: boundedInt(merged.cooldownMs, "cooldownMs", 100, 3_600_000),
    autoKillSwitchAfterOpenCount: boundedInt(
      merged.autoKillSwitchAfterOpenCount,
      "autoKillSwitchAfterOpenCount",
      1,
      20,
    ),
  });
}

function requireControl(control) {
  if (!control || typeof control !== "object" || Array.isArray(control)) {
    fail("TRUST_PAYMENT_PROVIDER_OPERATIONS_INVALID_CONTROL", "control must be an object");
  }
  for (const method of ["authorize", "health", "readiness", "engageKillSwitch", "status"]) {
    if (typeof control[method] !== "function") {
      fail("TRUST_PAYMENT_PROVIDER_OPERATIONS_INVALID_CONTROL", `control.${method} must be a function`);
    }
  }
  return control;
}

function normalizeSink(input, name) {
  if (input == null) {
    return Object.freeze({ async append() { return true; } });
  }
  if (typeof input.append !== "function") {
    fail("TRUST_PAYMENT_PROVIDER_OPERATIONS_INVALID_SINK", `${name}.append must be a function`);
  }
  return input;
}

function errorCode(error) {
  return String(error?.code ?? "TRUST_PAYMENT_PROVIDER_UNKNOWN_FAILURE").trim()
    || "TRUST_PAYMENT_PROVIDER_UNKNOWN_FAILURE";
}

function isProviderFailure(error) {
  const code = errorCode(error);
  if (LOCAL_ERROR_CODES.has(code)) return false;
  return (
    code === "TRUST_PAYMENT_PROVIDER_TIMEOUT"
    || code === "TRUST_PAYMENT_PROVIDER_INVALID_RESPONSE"
    || error?.retryable === true
    || code.startsWith("TRUST_PAYMENT_PROVIDER_UPSTREAM_")
  );
}

export function createBiometricPaymentProviderOperations({
  control: controlInput,
  telemetrySink: telemetryInput,
  incidentSink: incidentInput,
  policy: policyInput = {},
  nowMs = () => Date.now(),
} = {}) {
  const control = requireControl(controlInput);
  const telemetry = normalizeSink(telemetryInput, "telemetrySink");
  const incidents = normalizeSink(incidentInput, "incidentSink");
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
    reconcileTotal: 0,
    reconcileSucceeded: 0,
    reconcileFailed: 0,
    reconcileBlocked: 0,
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

  async function emit(target, type, fields = {}) {
    const event = Object.freeze({
      type,
      version: "1.0.0",
      provider: control.providerName ?? "unknown",
      mode: control.providerMode ?? "unknown",
      circuitState,
      ...fields,
      sensitiveContentIncluded: false,
    });
    await target.append(event);
    return event;
  }

  function transition(next, at) {
    circuitState = next;
    lastTransitionAt = at;
  }

  async function openCircuit(error, correlationId, operation) {
    const at = now();
    transition("open", at);
    openedUntil = at + policy.cooldownMs;
    halfOpenProbeInFlight = false;
    openCount += 1;
    counters.circuitOpened += 1;
    lastErrorCode = errorCode(error);

    await emit(incidents, "trust.payment.provider.circuit_opened", {
      correlationId,
      operation,
      errorCode: lastErrorCode,
      consecutiveFailures,
      openCount,
      openedUntil,
    });

    if (openCount >= policy.autoKillSwitchAfterOpenCount) {
      control.engageKillSwitch("incident.provider_repeated_failure");
      counters.killSwitchEngaged += 1;
      await emit(incidents, "trust.payment.provider.kill_switch_engaged", {
        correlationId,
        operation,
        reason: "incident.provider_repeated_failure",
        openCount,
      });
    }
  }

  async function prepareCircuit(correlationId, operation) {
    const at = now();
    const blockedCounter = operation === "reconcile" ? "reconcileBlocked" : "authorizeBlocked";

    if (circuitState === "open") {
      if (at < openedUntil) {
        counters[blockedCounter] += 1;
        await emit(telemetry, `trust.payment.provider.${operation}_blocked`, {
          correlationId,
          reason: "circuit_open",
          openedUntil,
        });
        fail("TRUST_PAYMENT_PROVIDER_CIRCUIT_OPEN", "payment provider circuit is open");
      }
      transition("half_open", at);
      counters.halfOpenTransitions += 1;
      halfOpenProbeInFlight = false;
      await emit(telemetry, "trust.payment.provider.circuit_half_open", {
        correlationId,
        operation,
        openCount,
      });
    }

    const wasHalfOpen = circuitState === "half_open";
    if (wasHalfOpen) {
      if (halfOpenProbeInFlight) {
        counters[blockedCounter] += 1;
        await emit(telemetry, `trust.payment.provider.${operation}_blocked`, {
          correlationId,
          reason: "half_open_probe_in_flight",
        });
        fail("TRUST_PAYMENT_PROVIDER_CIRCUIT_HALF_OPEN_BUSY", "half-open probe already in flight");
      }
      halfOpenProbeInFlight = true;
    }

    return Object.freeze({ startedAt: at, wasHalfOpen });
  }

  async function execute(operation, request, invoke) {
    const correlationId = required(request?.correlationId, "request.correlationId");
    const totalCounter = operation === "reconcile" ? "reconcileTotal" : "authorizeTotal";
    const succeededCounter = operation === "reconcile" ? "reconcileSucceeded" : "authorizeSucceeded";
    const failedCounter = operation === "reconcile" ? "reconcileFailed" : "authorizeFailed";
    counters[totalCounter] += 1;

    if (operation === "reconcile" && typeof control.getStatus !== "function") {
      counters[failedCounter] += 1;
      const error = new Error("payment provider reconciliation is unavailable");
      error.code = "TRUST_PAYMENT_PROVIDER_RECONCILIATION_UNAVAILABLE";
      await emit(telemetry, "trust.payment.provider.reconcile_failed", {
        correlationId,
        errorCode: error.code,
        providerFailure: false,
        consecutiveFailures,
        durationMs: 0,
      });
      throw error;
    }

    const { startedAt, wasHalfOpen } = await prepareCircuit(correlationId, operation);

    try {
      const result = await invoke();
      counters[succeededCounter] += 1;
      consecutiveFailures = 0;
      lastErrorCode = null;

      if (wasHalfOpen) {
        transition("closed", now());
        openedUntil = null;
        halfOpenProbeInFlight = false;
        await emit(telemetry, "trust.payment.provider.circuit_closed", {
          correlationId,
          operation,
          openCount,
        });
      }

      await emit(telemetry, `trust.payment.provider.${operation}_succeeded`, {
        correlationId,
        outcome: String(result?.status ?? "unknown"),
        durationMs: Math.max(0, now() - startedAt),
      });
      return result;
    } catch (error) {
      counters[failedCounter] += 1;
      lastErrorCode = errorCode(error);
      if (wasHalfOpen) halfOpenProbeInFlight = false;

      const providerFailure = isProviderFailure(error);
      if (providerFailure) consecutiveFailures += 1;

      await emit(telemetry, `trust.payment.provider.${operation}_failed`, {
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
        await openCircuit(error, correlationId, operation);
      }
      throw error;
    }
  }

  async function authorize(request = {}) {
    return execute("authorize", request, () => control.authorize(request));
  }

  async function reconcile(request = {}) {
    return execute("reconcile", request, () => control.getStatus(request));
  }

  async function health() {
    counters.healthChecks += 1;
    const result = await control.health();
    await emit(telemetry, "trust.payment.provider.health_checked", {
      outcome: String(result?.status ?? "unknown"),
    });
    return result;
  }

  async function readiness() {
    counters.readinessChecks += 1;
    const result = await control.readiness();
    await emit(telemetry, "trust.payment.provider.readiness_checked", {
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
    transition("closed", now());
    consecutiveFailures = 0;
    openedUntil = null;
    halfOpenProbeInFlight = false;
    lastErrorCode = null;
    await emit(incidents, "trust.payment.provider.circuit_reset", {
      reason: normalizedReason,
      openCount,
    });
    return status();
  }

  return Object.freeze({
    policy,
    authorize,
    reconcile,
    health,
    readiness,
    status,
    resetCircuit,
  });
}
