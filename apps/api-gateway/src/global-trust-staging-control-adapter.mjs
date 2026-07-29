const ACTIONS = Object.freeze([
  "baseline",
  "tenant-boundary",
  "authorization",
  "model-registry",
  "use-case-registry",
  "data-policy-registry",
  "admission-gate",
  "human-review",
  "prompt-defense",
  "output-validator",
  "tool-guard",
  "kill-switch",
  "integrity",
  "tenant-isolation",
  "fail-closed",
  "determinism",
  "cleanup",
]);

function text(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function bindingFor(bindings, action) {
  const binding = bindings?.[action];
  if (!binding || typeof binding.execute !== "function") {
    throw new TypeError(`binding for ${action} is required`);
  }
  return Object.freeze({
    contractType: text(binding.contractType, `${action}.contractType`),
    operation: text(binding.operation, `${action}.operation`),
    execute: binding.execute,
  });
}

export function createGlobalTrustStagingControlAdapter({
  bindings,
  seed = async () => ({ seeded: true }),
  verifyIntegrity = async () => ({
    valid: true,
    proofCount: 18,
    protectedRecordCount: 18,
  }),
  cleanup = async () => ({ cleaned: true, residualResources: 0 }),
  assertEnvironment = async () => ({ safe: true }),
} = {}) {
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
    throw new TypeError"("bindings must be an object");
  }
  for (const [name, fn] of Object.entries({
    seed,
    verifyIntegrity,
    cleanup,
    assertEnvironment,
  })) {
    if (typeof fn !== "function") throw new TypeError(`${name} must be a function`);
  }

  const map = new Map(ACTIONS.map((action) => [action, bindingFor(bindings, action)]));

  return Object.freeze({
    contractType: "GlobalTrustStagingControlAdapter",
    contractVersion: "2.0",
    assertEnvironment,
    seed,
    verifyIntegrity,
    cleanup,

    async executeScenario({
      scenario,
      tenantId,
      sourceSha,
      nullProvider,
      telemetry,
    } = {}) {
      if (!scenario || typeof scenario !== "object") {
        throw new TypeError("scenario is required");
      }
      const action = text(scenario.action, "scenario.action");
      const binding = map.get(action);
      if (!binding) throw new TypeError(`unsupported scenario action: ${action}`);

      const result = await binding.execute(Object.freeze({
        scenarioId: text(scenario.id, "scenario.id"),
        name: text(scenario.name, "scenario.name"),
        action,
        tenantId: text(tenantId, "tenantId"),
        sourceSha: text(sourceSha, "sourceSha"),
        nullProvider,
        telemetry,
      }));

      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new TypeError(`binding ${action} must return an object`);
      }
      const proof = result.controlProof;
      if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
        throw new TypeError(`binding ${action} must return controlProof`);
      }
      if (
        proof.contractType !== binding.contractType
        || proof.operation !== binding.operation
      ) {
        throw new TypeError(`binding ${action} returned an invalid controlProof`);
      }

      return Object.freeze({
        actualResult: text(result.actualResult, `${action}.actualResult`),
        evidenceRefs: Object.freeze(
          Array.isArray(result.evidenceRefs) ? [...result.evidenceRefs] : [],
        ),
        controlProof: Object.freeze({
          contractType: text(proof.contractType, `${action}.proof.contractType`),
          operation: text(proof.operation, `${action}.proof.operation`),
          recordId: text(proof.recordId, `${action}.proof.recordId`),
        }),
      });
    },
  });
}
