import { randomUUID } from "node:crypto";

import { createGlobalTrustNullProvider } from "./global-trust-null-provider.mjs";

const EXPECTED_IDS = Object.freeze(
  Array.from({ length: 18 }, (_, index) => `STG-${String(index + 1).padStart(2, "0")}`),
);
const SYNTHETIC_TENANT_PREFIX = "tenant_staging_";
const FORBIDDEN_REPORT_KEYS = new Set([
  "prompt",
  "syntheticOutput",
  "output",
  "arguments",
  "secret",
  "token",
  "apiKey",
  "authorization",
]);

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function objectValue(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function booleanValue(value, expected, name) {
  if (value !== expected) {
    throw new TypeError(`${name} must be ${expected}`);
  }
}

function freezeScenario(scenario, index) {
  const normalized = objectValue(scenario, `scenarios[${index}]`);
  return Object.freeze({
    id: required(normalized.id, `scenarios[${index}].id`),
    name: required(normalized.name, `scenarios[${index}].name`),
    action: required(normalized.action, `scenarios[${index}].action`),
    expectedResult: required(
      normalized.expectedResult,
      `scenarios[${index}].expectedResult`,
    ),
  });
}

export function validateGlobalTrustStagingManifest(manifest) {
  const source = objectValue(manifest, "manifest");
  if (source.contractType !== "GlobalTrustStagingHarnessManifest") {
    throw new TypeError("manifest.contractType is invalid");
  }
  if (source.contractVersion !== "1.0") {
    throw new TypeError("manifest.contractVersion must be 1.0");
  }
  if (source.mode !== "dry-run") {
    throw new TypeError("manifest.mode must be dry-run");
  }
  if (source.environment !== "ephemeral") {
    throw new TypeError("manifest.environment must be ephemeral");
  }

  const tenantId = required(source.tenantId, "manifest.tenantId");
  if (!tenantId.startsWith(SYNTHETIC_TENANT_PREFIX)) {
    throw new TypeError("manifest.tenantId must identify a synthetic staging tenant");
  }

  const provider = objectValue(source.provider, "manifest.provider");
  if (provider.type !== "null") {
    throw new TypeError("manifest.provider.type must be null");
  }
  booleanValue(provider.contactEnabled, false, "manifest.provider.contactEnabled");

  const network = objectValue(source.network, "manifest.network");
  if (network.egress !== "blocked") {
    throw new TypeError("manifest.network.egress must be blocked");
  }

  const execution = objectValue(source.execution, "manifest.execution");
  for (const key of [
    "inferenceEnabled",
    "modelExecutionEnabled",
    "toolExecutionEnabled",
    "automaticRemediationEnabled",
  ]) {
    booleanValue(execution[key], false, `manifest.execution.${key}`);
  }

  const cleanup = objectValue(source.cleanup, "manifest.cleanup");
  booleanValue(cleanup.required, true, "manifest.cleanup.required");
  if (cleanup.residualResourcesExpected !== 0) {
    throw new TypeError("manifest.cleanup.residualResourcesExpected must be 0");
  }

  if (!Array.isArray(source.scenarios)) {
    throw new TypeError("manifest.scenarios must be an array");
  }
  const scenarios = source.scenarios.map(freezeScenario);
  const ids = scenarios.map(({ id }) => id);
  if (
    ids.length !== EXPECTED_IDS.length
    || ids.some((id, index) => id !== EXPECTED_IDS[index])
  ) {
    throw new TypeError("manifest.scenarios must contain STG-01 through STG-18 in order");
  }
  if (new Set(ids).size !== ids.length) {
    throw new TypeError("manifest.scenarios must not contain duplicate IDs");
  }

  return Object.freeze({
    contractType: source.contractType,
    contractVersion: source.contractVersion,
    mode: source.mode,
    environment: source.environment,
    tenantId,
    provider: Object.freeze({ type: provider.type, contactEnabled: false }),
    network: Object.freeze({ egress: network.egress }),
    execution: Object.freeze({
      inferenceEnabled: false,
      modelExecutionEnabled: false,
      toolExecutionEnabled: false,
      automaticRemediationEnabled: false,
    }),
    cleanup: Object.freeze({ required: true, residualResourcesExpected: 0 }),
    scenarios: Object.freeze(scenarios),
  });
}

function requireAdapter(adapter) {
  const normalized = objectValue(adapter, "adapter");
  for (const method of ["seed", "executeScenario", "verifyIntegrity", "cleanup"]) {
    if (typeof normalized[method] !== "function") {
      throw new TypeError(`adapter.${method} must be a function`);
    }
  }
  if (
    normalized.assertEnvironment !== undefined
    && typeof normalized.assertEnvironment !== "function"
  ) {
    throw new TypeError("adapter.assertEnvironment must be a function");
  }
  return normalized;
}

function safeErrorCode(error) {
  const candidate = String(error?.code ?? "STAGING_HARNESS_ERROR").trim();
  return /^[A-Z0-9_:-]{1,80}$/.test(candidate)
    ? candidate
    : "STAGING_HARNESS_ERROR";
}

function evidenceRefs(value) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) {
    throw new TypeError("scenario evidenceRefs must be an array");
  }
  if (value.length > 50) {
    throw new RangeError("scenario evidenceRefs must contain at most 50 items");
  }
  return Object.freeze(
    value.map((item, index) => required(item, `evidenceRefs[${index}]`)),
  );
}

function assertReportHasNoSensitiveKeys(value, path = "report") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_REPORT_KEYS.has(key)) {
      throw new TypeError(`${path}.${key} is forbidden in staging evidence`);
    }
    assertReportHasNoSensitiveKeys(child, `${path}.${key}`);
  }
}

function freezeResult({
  scenario,
  actualResult,
  passed,
  evidence,
  errorCode = null,
}) {
  return Object.freeze({
    scenarioId: scenario.id,
    name: scenario.name,
    action: scenario.action,
    expectedResult: scenario.expectedResult,
    actualResult,
    passed,
    evidenceRefs: evidenceRefs(evidence),
    errorCode,
  });
}

export function createGlobalTrustStagingHarness({
  manifest,
  adapter,
  nullProvider = createGlobalTrustNullProvider(),
  runIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  const normalizedManifest = validateGlobalTrustStagingManifest(manifest);
  const normalizedAdapter = requireAdapter(adapter);
  if (typeof runIdFactory !== "function") {
    throw new TypeError("runIdFactory must be a function");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
  if (
    nullProvider?.mode !== "null"
    || nullProvider?.contactEnabled !== false
    || typeof nullProvider?.infer !== "function"
    || typeof nullProvider?.invokeTool !== "function"
  ) {
    throw new TypeError("nullProvider must be a non-contacting null provider");
  }

  return Object.freeze({
    manifest: normalizedManifest,

    async run({ sourceSha } = {}) {
      const normalizedSourceSha = required(sourceSha, "sourceSha");
      const runId = required(runIdFactory(), "runId");
      const startedAt = required(now(), "startedAt");
      const scenarioResults = [];
      let integrity = null;
      let fatalErrorCode = null;
      let cleanup = Object.freeze({
        cleaned: false,
        residualResources: null,
      });

      try {
        if (normalizedAdapter.assertEnvironment) {
          await normalizedAdapter.assertEnvironment({
            manifest: normalizedManifest,
            sourceSha: normalizedSourceSha,
            nullProvider,
          });
        }

        await normalizedAdapter.seed({
          manifest: normalizedManifest,
          sourceSha: normalizedSourceSha,
          nullProvider,
        });

        for (const scenario of normalizedManifest.scenarios) {
          try {
            const execution = objectValue(
              await normalizedAdapter.executeScenario({
                scenario,
                manifest: normalizedManifest,
                sourceSha: normalizedSourceSha,
                nullProvider,
              }),
              `adapter.executeScenario(${scenario.id})`,
            );
            const actualResult = required(
              execution.actualResult,
              `${scenario.id}.actualResult`,
            );
            scenarioResults.push(freezeResult({
              scenario,
              actualResult,
              passed: actualResult === scenario.expectedResult,
              evidence: execution.evidenceRefs,
            }));
          } catch (error) {
            const actualResult = "fail_closed";
            scenarioResults.push(freezeResult({
              scenario,
              actualResult,
              passed: scenario.expectedResult === actualResult,
              evidence: [],
              errorCode: safeErrorCode(error),
            }));
          }
        }

        integrity = objectValue(
          await normalizedAdapter.verifyIntegrity({
            manifest: normalizedManifest,
            sourceSha: normalizedSourceSha,
          }),
          "adapter.verifyIntegrity result",
        );
        if (integrity.valid !== true) {
          fatalErrorCode = "INTEGRITY_VERIFICATION_FAILED";
        }
      } catch (error) {
        fatalErrorCode = safeErrorCode(error);
      } finally {
        try {
          const cleanupResult = objectValue(
            await normalizedAdapter.cleanup({
              manifest: normalizedManifest,
              sourceSha: normalizedSourceSha,
            }),
            "adapter.cleanup result",
          );
          cleanup = Object.freeze({
            cleaned: cleanupResult.cleaned === true,
            residualResources: Number(cleanupResult.residualResources),
          });
          if (
            cleanup.cleaned !== true
            || cleanup.residualResources !== normalizedManifest.cleanup.residualResourcesExpected
          ) {
            fatalErrorCode ??= "CLEANUP_VERIFICATION_FAILED";
          }
        } catch (error) {
          cleanup = Object.freeze({
            cleaned: false,
            residualResources: null,
          });
          fatalErrorCode ??= safeErrorCode(error);
        }
      }

      const completedAt = required(now(), "completedAt");
      const allScenariosPassed =
        scenarioResults.length === normalizedManifest.scenarios.length
        && scenarioResults.every(({ passed }) => passed);
      const passed =
        fatalErrorCode === null
        && allScenariosPassed
        && integrity?.valid === true
        && cleanup.cleaned === true
        && cleanup.residualResources === 0;

      const report = Object.freeze({
        contractType: "GlobalTrustStagingHarnessReport",
        contractVersion: "1.0",
        runId,
        sourceSha: normalizedSourceSha,
        mode: normalizedManifest.mode,
        environment: normalizedManifest.environment,
        tenantId: normalizedManifest.tenantId,
        status: passed ? "passed" : "failed",
        fatalErrorCode,
        startedAt,
        completedAt,
        scenarioCount: scenarioResults.length,
        passedScenarioCount: scenarioResults.filter(({ passed: value }) => value).length,
        scenarios: Object.freeze(scenarioResults),
        integrity: integrity
          ? Object.freeze({
              valid: integrity.valid === true,
              proofCount: Number(integrity.proofCount ?? 0),
              protectedRecordCount: Number(integrity.protectedRecordCount ?? 0),
            })
          : null,
        cleanup,
        inferenceExecuted: false,
        modelExecuted: false,
        toolExecuted: false,
        providerContacted: false,
        automaticRemediationExecuted: false,
        egressEnabled: false,
        sensitiveContentIncluded: false,
      });

      assertReportHasNoSensitiveKeys(report);
      return report;
    },
  });
}
