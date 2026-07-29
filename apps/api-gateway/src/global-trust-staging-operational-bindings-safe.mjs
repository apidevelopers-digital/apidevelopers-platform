import {
  SAFETY_SIMULATION_INTEGRITY_COLLECTION,
} from "./global-trust-safety-simulation-integrity.mjs";
import {
  buildGlobalTrustStagingOperationalBindings as buildBaseBindings,
  verifyGlobalTrustStagingOperationalIntegrity,
} from "./global-trust-staging-operational-bindings.mjs";
import {
  simulationInput,
} from "./global-trust-staging-operational-fixtures.mjs";

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function bindingResult(actualResult, {
  contractType,
  operation,
  recordId,
  evidenceRefs = [],
}) {
  return Object.freeze({
    actualResult,
    evidenceRefs: Object.freeze([...evidenceRefs]),
    controlProof: Object.freeze({
      contractType,
      operation,
      recordId,
    }),
  });
}

function createIntegrityBinding({ gateway, tenantId }) {
  return Object.freeze({
    contractType:
      "GlobalTrustSafetySimulationIntegrityVerification",
    operation: "verifyTenant",

    async execute({ scenarioId }) {
      const simulation = await gateway.safetySimulation.run(
        simulationInput(tenantId, {
          correlationId: `corr_${scenarioId}_tamper_probe`,
        }),
      );
      const simulationId = required(
        simulation.simulationId,
        "simulation.simulationId",
      );
      let originalProof;
      let proofId;

      await gateway.store.transaction((tx) => {
        const proof = tx.list(
          SAFETY_SIMULATION_INTEGRITY_COLLECTION,
        )
          .map(({ value }) => value)
          .find((value) =>
            value?.tenantId === tenantId
            && value?.recordId === simulationId
          );
        if (!proof) {
          const error = new Error(
            "integrity probe proof not found",
          );
          error.code = "INTEGRITY_PROBE_PROOF_NOT_FOUND";
          throw error;
        }
        proofId = required(proof.proofId, "proof.proofId");
        originalProof = proof;
        tx.put(
          SAFETY_SIMULATION_INTEGRITY_COLLECTION,
          proofId,
          {
            ...proof,
            proofHash: "f".repeat(64),
          },
        );
      });

      let verification;
      try {
        verification =
          await gateway.safetySimulationIntegrity.verifyTenant({
            tenantId,
          });
      } finally {
        if (proofId && originalProof) {
          await gateway.store.transaction((tx) => {
            tx.put(
              SAFETY_SIMULATION_INTEGRITY_COLLECTION,
              proofId,
              originalProof,
            );
          });
        }
      }

      const restored =
        await gateway.safetySimulationIntegrity.verifyTenant({
          tenantId,
        });
      if (restored.valid !== true) {
        const error = new Error(
          "integrity probe restoration failed",
        );
        error.code = "INTEGRITY_PROBE_RESTORE_FAILED";
        throw error;
      }

      return bindingResult(
        verification?.valid === false
          ? "invalid_integrity"
          : "valid_integrity",
        {
          contractType:
            verification?.contractType
            ?? "GlobalTrustSafetySimulationIntegrityVerification",
          operation: "verifyTenant",
          recordId: `integrity:${simulationId}`,
          evidenceRefs: [`integrity:${simulationId}`],
        },
      );
    },
  });
}

export function buildGlobalTrustStagingOperationalBindings(options) {
  const base = buildBaseBindings(options);
  return Object.freeze({
    ...base,
    integrity: createIntegrityBinding({
      gateway: options.gateway,
      tenantId: options.tenantId,
    }),
  });
}

export { verifyGlobalTrustStagingOperationalIntegrity };
