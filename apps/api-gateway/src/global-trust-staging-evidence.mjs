const SAFE_TOKEN = /^[A-Za-z0-9_.:-]+$/;
const SAFE_REF = /^[a-z][a-z0-9_.-]{0,31}:[A-Za-z0-9._/-]{1,96}$/;
const SHA1 = /^[0-9a-f]{40}$/;

function safeString(value, name, {
  maximum = 120,
  pattern = SAFE_TOKEN,
} = {}) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  if (normalized.length > maximum || !pattern.test(normalized)) {
    throw new TypeError(`${name} has an invalid format`);
  }
  return normalized;
}

function safeNullableString(value, name, options) {
  if (value === null || value === undefined) return null;
  return safeString(value, name, options);
}

function safeInteger(value, name, { minimum = 0, maximum = 1_000_000 } = {}) {
  const normalized = Number(value);
  if (
    !Number.isInteger(normalized)
    || normalized < minimum
    || normalized > maximum
  ) {
    throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return normalized;
}

function safeEvidenceRefs(value, name) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 50) {
    throw new TypeError(`${name} must be an array with at most 50 items`);
  }
  const refs = value.map((item, index) =>
    safeString(item, `${name}[${index}]`, { maximum: 128, pattern: SAFE_REF })
  );
  if (new Set(refs).size !== refs.length) {
    throw new TypeError(`${name} must not contain duplicates`);
  }
  return Object.freeze(refs);
}

function safeScenario(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`scenarios[${index}] must be an object`);
  }
  return Object.freeze({
    scenarioId: safeString(value.scenarioId, `scenarios[${index}].scenarioId`, {
      maximum: 16,
      pattern: /^STG-(0[1-9]|1[0-8])$/,
    }),
    action: safeString(value.action, `scenarios[${index}].action`, { maximum: 48 }),
    expectedResult: safeString(
      value.expectedResult,
      `scenarios[${index}].expectedResult`,
      { maximum: 48 },
    ),
    actualResult: safeString(
      value.actualResult,
      `scenarios[${index}].actualResult`,
      { maximum: 48 },
    ),
    passed: value.passed === true,
    evidenceRefs: safeEvidenceRefs(
      value.evidenceRefs,
      `scenarios[${index}].evidenceRefs`,
    ),
    controlProof: Object.freeze({
      contractType: safeString(
        value.controlProof?.contractType,
        `scenarios[${index}].controlProof.contractType`,
        { maximum: 80 },
      ),
      operation: safeString(
        value.controlProof?.operation,
        `scenarios[${index}].controlProof.operation`,
        { maximum: 80 },
      ),
      recordId: safeString(
        value.controlProof?.recordId,
        `scenarios[${index}].controlProof.recordId`,
        { maximum: 120 },
      ),
    }),
    errorCode: safeNullableString(
      value.errorCode,
      `scenarios[${index}].errorCode`,
      { maximum: 80 },
    ),
  });
}

export function sanitizeGlobalTrustStagingReport(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("report input must be an object");
  }
  if (!Array.isArray(input.scenarios) || input.scenarios.length !== 18) {
    throw new TypeError("report must contain exactly 18 scenarios");
  }

  const telemetry = input.telemetry;
  if (!telemetry || typeof telemetry !== "object" || Array.isArray(telemetry)) {
    throw new TypeError("report.telemetry must be an object");
  }
  const flags = input.executionFlags;
  if (!flags || typeof flags !== "object" || Array.isArray(flags)) {
    throw new TypeError("report.executionFlags must be an object");
  }

  const report = {
    contractType: "GlobalTrustStagingHarnessReport",
    contractVersion: "2.0",
    runId: safeString(input.runId, "report.runId", { maximum: 96 }),
    sourceSha: safeString(input.sourceSha, "report.sourceSha", {
      maximum: 40,
      pattern: SHA1,
    }),
    tenantId: safeString(input.tenantId, "report.tenantId", { maximum: 80 }),
    mode: safeString(input.mode, "report.mode", { maximum: 24 }),
    environment: safeString(input.environment, "report.environment", {
      maximum: 24,
    }),
    status: input.status === "passed" ? "passed" : "failed",
    fatalErrorCode: safeNullableString(
      input.fatalErrorCode,
      "report.fatalErrorCode",
      { maximum: 80 },
    ),
    startedAt: safeString(input.startedAt, "report.startedAt", {
      maximum: 32,
      pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,
    }),
    completedAt: safeString(input.completedAt, "report.completedAt", {
      maximum: 32,
      pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,
    }),
    scenarioCount: safeInteger(input.scenarioCount, "report.scenarioCount", {
      minimum: 18,
      maximum: 18,
    }),
    passedScenarioCount: safeInteger(
      input.passedScenarioCount,
      "report.passedScenarioCount",
      { minimum: 0, maximum: 18 },
    ),
    scenarios: Object.freeze(input.scenarios.map(safeScenario)),
    integrity: Object.freeze({
      valid: input.integrity?.valid === true,
      proofCount: safeInteger(
        input.integrity?.proofCount ?? 0,
        "report.integrity.proofCount",
      ),
      protectedRecordCount: safeInteger(
        input.integrity?.protectedRecordCount ?? 0,
        "report.integrity.protectedRecordCount",
      ),
    }),
    cleanup: Object.freeze({
      cleaned: input.cleanup?.cleaned === true,
      residualResources: safeInteger(
        input.cleanup?.residualResources ?? 0,
        "report.cleanup.residualResources",
      ),
    }),
    telemetry: Object.freeze({
      inferenceExecutionCount: safeInteger(
        telemetry.inferenceExecutionCount,
        "report.telemetry.inferenceExecutionCount",
      ),
      modelExecutionCount: safeInteger(
        telemetry.modelExecutionCount,
        "report.telemetry.modelExecutionCount",
      ),
      toolExecutionCount: safeInteger(
        telemetry.toolExecutionCount,
        "report.telemetry.toolExecutionCount",
      ),
      providerContactCount: safeInteger(
        telemetry.providerContactCount,
        "report.telemetry.providerContactCount",
      ),
      automaticRemediationCount: safeInteger(
        telemetry.automaticRemediationCount,
        "report.telemetry.automaticRemediationCount",
      ),
      sensitiveContentCount: safeInteger(
        telemetry.sensitiveContentCount,
        "report.telemetry.sensitiveContentCount",
      ),
      networkAttemptCount: safeInteger(
        telemetry.networkAttemptCount,
        "report.telemetry.networkAttemptCount",
      ),
      networkBlockedCount: safeInteger(
        telemetry.networkBlockedCount,
        "report.telemetry.networkBlockedCount",
      ),
      networkSuccessfulCount: safeInteger(
        telemetry.networkSuccessfulCount,
        "report.telemetry.networkSuccessfulCount",
      ),
      eventCount: safeInteger(telemetry.eventCount, "report.telemetry.eventCount"),
    }),
    executionFlags: Object.freeze({
      inferenceExecuted: flags.inferenceExecuted === true,
      modelExecuted: flags.modelExecuted === true,
      toolExecuted: flags.toolExecuted === true,
      providerContacted: flags.providerContacted === true,
      automaticRemediationExecuted:
        flags.automaticRemediationExecuted === true,
      egressEnabled: flags.egressEnabled === true,
      sensitiveContentIncluded: flags.sensitiveContentIncluded === true,
    }),
    networkGuard: Object.freeze({
      installedDuringExecution: input.networkGuard?.installedDuringExecution === true,
      mode: safeString(input.networkGuard?.mode, "report.networkGuard.mode", {
        maximum: 24,
      }),
    }),
  };

  return Object.freeze(report);
}
