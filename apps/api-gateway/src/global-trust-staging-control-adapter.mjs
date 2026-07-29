const ACTIONS = Object.freeze([
  "baseline","tenant-boundary","authorization","model-registry",
  "use-case-registry","data-policy-registry","admission-gate","human-review",
  "prompt-defense","output-validator","tool-guard","kill-switch","integrity",
  "tenant-isolation","fail-closed","determinism","cleanup",
]);

function required(value, name) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
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
    throw new TypeError("bindings must be an object");
  }
  for (const fn of [seed, verifyIntegrity, cleanup, assertEnvironment]) {
    if (typeof fn !== "function") throw new TypeError("adapter hooks must be functions");
  }

  const normalized = new Map(ACTIONS.map((action) => {
    const binding = bindings[action];
    if (!binding || typeof binding.execute !== "function") {
      throw new TypeError(`binding for ${action} is required`);
    }
    return [action, Object.freeze({
      contractType: required(binding.contractType, `${action}.contractType`),
      operation: required(binding.operation, `${action}.operation`),
      execute: binding.execute,
    })];
  }));

  return Object.freeze({
    contractType: "GlobalTrustStagingControlAdapter",
    contractVersion: "2.0",
    assertEnvironment,
    seed,
    verifyIntegrity,
    cleanup,

    async executeScenario({ scenario, tenantId, sourceSha, nullProvider, telemetry } = {}) {
      if (!scenario || typeof scenario !== "object") {
        throw new TypeError("scenario is required");
      }
      const action = required(scenario.action, "scenario.action");
      const binding = normalized.get(action);
      if (!binding) throw new TypeError(`unsupported scenario action: ${action}`);

      const result = await binding.execute(Object.freeze({
        scenarioId: required(scenario.id, "scenario.id"),
        name: required(scenario.name, "scenario.name"),
        action,
        tenantId: required(tenantId, "tenantId"),
        sourceSha: required(sourceSha, "sourceSha"),
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
        actualResult: required(result.actualResult, `${action}.actualResult`),
        evidenceRefs: Object.freeze(
          Array.isArray(result.evidenceRefs) ? [...result.evidenceRefs] : [],
        ),
        controlProof: Object.freeze({
          contractType: required(proof.contractType, `${action}.proof.contractType`),
          operation: required(proof.operation, `${action}.proof.operation`),
          recordId: required(proof.recordId, `${action}.proof.recordId`),
        }),
      });
    },
  });
}
