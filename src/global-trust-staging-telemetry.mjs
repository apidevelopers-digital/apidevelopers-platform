const COUNTER_KEYS = Object.freeze([
  "inferenceExecutionCount",
  "modelExecutionCount",
  "toolExecutionCount",
  "providerContactCount",
  "automaticRemediationCount",
  "sensitiveContentCount",
  "networkAttemptCount",
  "networkBlockedCount",
  "networkSuccessfulCount",
]);

function safeToken(value, name, maximum = 80) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  if (normalized.length > maximum || !/^[A-Za-z0-9_.:-]+$/.test(normalized)) {
    throw new TypeError(`${name} has an invalid format`);
  }
  return normalized;
}

export function createGlobalTrustStagingTelemetry() {
  const counters = Object.fromEntries(COUNTER_KEYS.map((key) => [key, 0]));
  const events = [];

  function record(type, details = {}) {
    const normalizedType = safeToken(type, "telemetry.type");
    const operation = details.operation === undefined
      ? null
      : safeToken(details.operation, "telemetry.operation");
    events.push(Object.freeze({
      type: normalizedType,
      operation,
      blocked: details.blocked === true,
    }));
  }

  return Object.freeze({
    recordInferenceExecution(details) {
      counters.inferenceExecutionCount += 1;
      record("inference_execution", details);
    },
    recordModelExecution(details) {
      counters.modelExecutionCount += 1;
      record("model_execution", details);
    },
    recordToolExecution(details) {
      counters.toolExecutionCount += 1;
      record("tool_execution", details);
    },
    recordProviderContact(details) {
      counters.providerContactCount += 1;
      record("provider_contact", details);
    },
    recordAutomaticRemediation(details) {
      counters.automaticRemediationCount += 1;
      record("automatic_remediation", details);
    },
    recordSensitiveContent(details) {
      counters.sensitiveContentCount += 1;
      record("sensitive_content", details);
    },
    recordNetworkAttempt({ operation, blocked = false } = {}) {
      counters.networkAttemptCount += 1;
      if (blocked) counters.networkBlockedCount += 1;
      else counters.networkSuccessfulCount += 1;
      record("network_attempt", { operation, blocked });
    },
    snapshot() {
      const copy = Object.fromEntries(
        COUNTER_KEYS.map((key) => [key, counters[key]]),
      );
      return Object.freeze({
        ...copy,
        eventCount: events.length,
        events: Object.freeze([...events]),
      });
    },
  });
}

export function deriveGlobalTrustStagingExecutionFlags(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new TypeError("telemetry snapshot is required");
  }
  return Object.freeze({
    inferenceExecuted: Number(snapshot.inferenceExecutionCount) > 0,
    modelExecuted: Number(snapshot.modelExecutionCount) > 0,
    toolExecuted: Number(snapshot.toolExecutionCount) > 0,
    providerContacted:
      Number(snapshot.providerContactCount) > 0
      || Number(snapshot.networkSuccessfulCount) > 0,
    automaticRemediationExecuted:
      Number(snapshot.automaticRemediationCount) > 0,
    egressEnabled: Number(snapshot.networkSuccessfulCount) > 0,
    sensitiveContentIncluded: Number(snapshot.sensitiveContentCount) > 0,
  });
}
