import { randomUUID } from "node:crypto";

import { createGlobalTrustNullProvider } from "./global-trust-null-provider.mjs";
import { sanitizeGlobalTrustStagingReport } from "./global-trust-staging-evidence.mjs";
import { createGlobalTrustStagingNetworkGuard } from "./global-trust-staging-network-guard.mjs";
import {
  createGlobalTrustStagingTelemetry,
  deriveGlobalTrustStagingExecutionFlags,
} from "./global-trust-staging-telemetry.mjs";

const EXPECTED_IDS = Object.freeze(
  Array.from({ length: 18 }, (_, index) => `STG-${String(index + 1).padStart(2, "0")}`),
);
const EXACT_TENANT_ID = "tenant_staging_global_trust_001";
const SHA1 = /^[0-9a-f]{40}$/;

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

function exactBoolean(value, expected, name) {
  if (value !== expected) throw new TypeError(`${name} must be ${expected}`);
}

function safeErrorCode(error) {
  const candidate = String(error?.code ?? "STAGING_HARNESS_ERROR").trim();
  return /^[A-Z0-9_:-]{1,80}$/.test(candidate)
    ? candidate
    : "STAGING_HARNESS_ERROR";
}

function validateManifest(manifest) {
  const source = objectValue(manifest, "manifest");
  if (source.contractType !== "GlobalTrustStagingHarnessManifest") {
    throw new TypeError("manifest.contractType is invalid");
  }
  if (source.contractVersion !== "1.0") {
    throw new TypeError("manifest.contractVersion must be 1.0");
  }
  if (source.mode !== "dry-run") throw new TypeError("manifest.mode must be dry-run");
  if (source.environment !== "ephemeral") {
    throw new TypeError("manifest.environment must be ephemeral");
  }
  if (source.tenantId !== EXACT_TENANT_ID) {
    throw new TypeError(`manifest.tenantId must be ${EXACT_TENANT_ID}`);
  }

  const provider = objectValue(source.provider, "manifest.provider");
  if (provider.type !== "null") throw new TypeError("manifest.provider.type must be null");
  exactBoolean(provider.contactEnabled, false, "manifest.provider.contactEnabled");

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
    exactBoolean(execution[key], false, `manifest.execution.${key}`);
  }

  const cleanup = objectValue(source.cleanup, "manifest.cleanup");
  exactBoolean(cleanup.required, true, "manifest.cleanup.required");
  if (cleanup.residualResourcesExpected !== 0) {
    throw new TypeError("manifest.cleanup.residualResourcesExpected must be 0");
  }

  if (!Array.isArray(source.scenarios) || source.scenarios.length !== EXPECTED_IDS.length) {
    throw new TypeError("manifest.scenarios must contain exactly STG-01 through STG-18");
  }
  const scenarios = source.scenarios.map((scenario, index) => {
    const value = objectValue(scenario, `manifest.scenarios[${index}]`);
    const normalized = Object.freeze({
      id: required(value.id, `manifest.scenarios[${index}].id`),
      name: required(value.name, `manifest.scenarios[${index}].name`),
      action: required(value.action, `manifest.scenarios[${index}].action`),
      expectedResult: required(
        value.expectedResult,
        `manifest.scenarios[${index}].expectedResult`,
      ),
    });
    if (normalized.id !== EXPECTED_IDS[index]) {
      throw new TypeError("manifest.scenarios must contain STG-01 through STG-18 in order");
    }
    return normalized;
  });

  return Object.freeze({
    contractType: source.contractType,
    contractVersion: source.contractVersion,
    mode: source.mode,
    environment: source.environment,
    tenantId: source.tenantId,
    provider: Object.freeze({ type: "null", contactEnabled: false }),
    network: Object.freeze({ egress: "blocked" }),
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
  const value = objectValue(adapter, "adapter");
  if (value.contractType !== "GlobalTrustStagingControlAdapter") {
    throw new TypeError("adapter.contractType must be GlobalTrustStagingControlAdapter");
  }
  if (value.contractVersion !== "2.0") {
    throw new TypeError("adapter.contractVersion must be 2.0");
  }
  for (const method of [
    "assertEnvironment",
    "seed",
    "executeScenario",
    "verifyIntegrity",
    "cleanup",
  ]) {
    if (typeof value[method] !== "function") {
      throw new TypeError(`adapter.${method} must be a function`);
    }
  }
  return value;
}

function scenarioFailureProof(scenarioId, errorCode) {
  return Object.freeze({
    contractType: "GlobalTrustStagingFailClosedProof",
    operation: "scenario-error",
    recordId: `fail-closed:${scenarioId}:${errorCode}`,
  });
}

function freezeScenarioResult({
  scenario,
  actualResult,
  evidenceRefs = [],
  controlProof,
  errorCode = null,
}) {
  return Object.freeze({
    scenarioId: scenario.id,
    action: scenario.action,
    expectedResult: scenario.expectedResult,
    actualResult,
    passed: actualResult === scenario.expectedResult,
    evidenceRefs: Object.freeze([...evidenceRefs]),
    controlProof: Object.freeze({ ...controlProof }),
    errorCode,
  });
}

function zeroExecutionInvariant(flags) {
  return Object.values(flags).every((value) => value === false);
}

export function createGlobalTrustStagingHarnessV2({
  manifest,
  adapter,
  nullProvider = createGlobalTrustNullProvider(),
  telemetryFactory = createGlobalTrustStagingTelemetry,
  networkGuardFactory = createGlobalTrustStagingNetworkGuard,
  runIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  const normalizedManifest = validateManifest(manifest);
  const normalizedAdapter = requireAdapter(adapter);
  if (typeof telemetryFactory !== "function") {
    throw new TypeError("telemetryFactory must be a function");
  }
  if (typeof networkGuardFactory !== "function") {
    throw new TypeError("networkGuardFactory must be a function");
  }
  if (typeof runIdFactory !== "function") throw new TypeError("runIdFactory must be a function");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (
    nullProvider?.mode !== "null"
    || nullProvider?.contactEnabled !== false
    || typeof nullProvider?.infer !== "function"
    || typeof nullProvider?.invokeTool !== "function"
  ) {
    throw new TypeError("nullProvider must be a non-contacting null provider");
  }

  return Object.freeze({
    contractType: "GlobalTrustStagingHarness",
    contractVersion: "2.0",
    manifest: normalizedManifest,

    async run({ sourceSha } = {}) {
      const normalizedSourceSha = required(sourceSha, "sourceSha");
      if (!SHA1.test(normalizedSourceSha)) {
        throw new TypeError("sourceSha must be a full lowercase SHA-1");
      }

      const runId = required(runIdFactory(), "runId");
      const startedAt = required(now(), "startedAt");
      const telemetry = telemetryFactory();
      const networkGuard = networkGuardFactory({ telemetry });
      const scenarioResults = [];
      let integrity = null;
      let fatalErrorCode = null;
      let cleanup = Object.freeze({ cleaned: false, residualResources: 0 });
      let guardInstalledDuringExecution = false;

      try {
        networkGuard.install();
        guardInstalledDuringExecution = networkGuard.installed === true;

        await normalizedAdapter.assertEnvironment({
          manifest: normalizedManifest,
          sourceSha: normalizedSourceSha,
          nullProvider,
          telemetry,
          networkGuard,
        });
        await normalizedAdapter.seed({
          manifest: normalizedManifest,
          sourceSha: normalizedSourceSha,
          nullProvider,
          telemetry,
        });

        for (const scenario of normalizedManifest.scenarios) {
          try {
            const execution = objectValue(
              await normalizedAdapter.executeScenario({
                scenario: Object.freeze({
                  id: scenario.id,
                  name: scenario.name,
                  action: scenario.action,
                }),
                tenantId: normalizedManifest.tenantId,
                sourceSha: normalizedSourceSha,
                nullProvider,
                telemetry,
              }),
              `adapter.executeScenario(${scenario.id})`,
            );
            scenarioResults.push(freezeScenarioResult({
              scenario,
              actualResult: required(execution.actualResult, `${scenario.id}.actualResult`),
              evidenceRefs: execution.evidenceRefs,
              controlProof: objectValue(execution.controlProof, `${scenario.id}.controlProof`),
            }));
          } catch (error) {
            const errorCode = safeErrorCode(error);
            scenarioResults.push(freezeScenarioResult({
              scenario,
              actualResult: "fail_closed",
              evidenceRefs: [],
              controlProof: scenarioFailureProof(scenario.id, errorCode),
              errorCode,
            }));
          }
        }

        integrity = objectValue(
          await normalizedAdapter.verifyIntegrity({
            manifest: normalizedManifest,
            sourceSha: normalizedSourceSha,
            scenarioResults: Object.freeze([...scenarioResults]),
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
            residualResources: Number(cleanupResult.residualResources ?? 0),
          });
          if (cleanup.cleaned !== true || cleanup.residualResources !== 0) {
            fatalErrorCode ??= "CLEANUP_VERIFICATION_FAILED";
          }
        } catch (error) {
          cleanup = Object.freeze({ cleaned: false, residualResources: 0 });
          fatalErrorCode ??= safeErrorCode(error);
        } finally {
          networkGuard.uninstall();
        }
      }

      const telemetrySnapshot = telemetry.snapshot();
      const executionFlags = deriveGlobalTrustStagingExecutionFlags(telemetrySnapshot);
      if (!zeroExecutionInvariant(executionFlags)) {
        fatalErrorCode ??= "ZERO_EXECUTION_INVARIANT_VIOLATED";
      }
      if (!guardInstalledDuringExecution) {
        fatalErrorCode ??= "NETWORK_GUARD_NOT_INSTALLED";
      }

      const allScenariosPassed =
        scenarioResults.length === normalizedManifest.scenarios.length
        && scenarioResults.every(({ passed }) => passed);
      const passed =
        fatalErrorCode === null
        && allScenariosPassed
        && integrity?.valid === true
        && cleanup.cleaned === true
        && cleanup.residualResources === 0;

      const completedAt = required(now(), "completedAt");
      return sanitizeGlobalTrustStagingReport({
        runId,
        sourceSha: normalizedSourceSha,
        tenantId: normalizedManifest.tenantId,
        mode: normalizedManifest.mode,
        environment: normalizedManifest.environment,
        status: passed ? "passed" : "failed",
        fatalErrorCode,
        startedAt,
        completedAt,
        scenarioCount: scenarioResults.length,
        passedScenarioCount: scenarioResults.filter(({ passed: value }) => value).length,
        scenarios: scenarioResults,
        integrity: integrity
          ? {
              valid: integrity.valid === true,
              proofCount: Number(integrity.proofCount ?? 0),
              protectedRecordCount: Number(integrity.protectedRecordCount ?? 0),
            }
          : { valid: false, proofCount: 0, protectedRecordCount: 0 },
        cleanup,
        telemetry: telemetrySnapshot,
        executionFlags,
        networkGuard: {
          installedDuringExecution: guardInstalledDuringExecution,
          mode: "deny-all",
        },
      });
    },
  });
}
