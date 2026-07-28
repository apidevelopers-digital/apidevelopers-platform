import { randomUUID } from "node:crypto";

import { sha256Canonical } from "./canonical-hash.mjs";
import {
  SAFETY_SIMULATION_COLLECTION,
  createGlobalTrustSafetySimulationIntegrity,
} from "./global-trust-safety-simulation-integrity.mjs";

const MAX_TOOL_PROPOSALS = 10;
const OUTCOME_RANK = Object.freeze({
  allow: 0,
  pending_approval: 1,
  review: 1,
  deny: 2,
});
const SEVERITY_RANK = Object.freeze({
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3,
});

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function nonEmptyText(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  const normalized = value.normalize("NFC");
  if (Buffer.byteLength(normalized, "utf8") < 1) {
    throw new TypeError(`${name} must not be empty`);
  }
  return normalized;
}

function stringArray(value, name, maximum = 50) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  if (value.length > maximum) {
    throw new RangeError(`${name} must contain at most ${maximum} items`);
  }
  const normalized = value.map((item, index) => required(item, `${name}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${name} must not contain duplicates`);
  }
  return Object.freeze(normalized.sort());
}

function toolProposalArray(value) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError("toolProposals must be an array");
  if (value.length > MAX_TOOL_PROPOSALS) {
    throw new RangeError(`toolProposals must contain at most ${MAX_TOOL_PROPOSALS} items`);
  }
  return Object.freeze(value.map((proposal, index) => {
    if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
      throw new TypeError(`toolProposals[${index}] must be an object`);
    }
    return Object.freeze({ ...proposal });
  }));
}

function normalizedOutcome(value) {
  const outcome = required(value, "decision.outcome");
  if (!(outcome in OUTCOME_RANK)) throw new TypeError("decision outcome is invalid");
  return outcome === "pending_approval" ? "review" : outcome;
}

function aggregateOutcome(decisions) {
  let selected = "allow";
  for (const decision of decisions) {
    const candidate = normalizedOutcome(decision.outcome);
    if (OUTCOME_RANK[candidate] > OUTCOME_RANK[selected]) selected = candidate;
  }
  return selected;
}

function severityFor(decision) {
  if (decision.riskLevel && decision.riskLevel in SEVERITY_RANK) {
    return decision.riskLevel;
  }
  return normalizedOutcome(decision.outcome) === "deny" ? "high" : "moderate";
}

function candidate({ decision, category, sourceType, order }) {
  const outcome = normalizedOutcome(decision.outcome);
  if (outcome === "allow") return null;
  const severity = severityFor(decision);
  return Object.freeze({
    decision,
    category,
    sourceType,
    severity,
    score: OUTCOME_RANK[outcome] * 10 + SEVERITY_RANK[severity],
    order,
  });
}

function decisionRef(type, decision) {
  const id = decision.decisionId ?? decision.assessmentId ?? decision.safetyDecisionId;
  return `${type}:${required(id, `${type}.decisionId`)}`;
}

function freezeSummary(decision, type) {
  return Object.freeze({
    type,
    decisionId: required(
      decision.decisionId ?? decision.assessmentId ?? decision.safetyDecisionId,
      `${type}.decisionId`,
    ),
    outcome: normalizedOutcome(decision.outcome),
    riskLevel: decision.riskLevel ?? null,
    reasonCodes: Object.freeze([...(decision.reasonCodes ?? [])]),
  });
}

export function createGlobalTrustSafetySimulation({
  store,
  admissionGate,
  promptDefense,
  outputValidator,
  toolInvocationGuard,
  incidentQueue,
  integrity = createGlobalTrustSafetySimulationIntegrity({ store }),
  simulationIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction is required");
  }
  for (const [name, service] of Object.entries({
    admissionGate,
    promptDefense,
    outputValidator,
    toolInvocationGuard,
    incidentQueue,
  })) {
    const method = name === "incidentQueue" ? "create" : "evaluate";
    if (typeof service?.[method] !== "function") {
      throw new TypeError(`${name}.${method} is required`);
    }
  }
  if (typeof integrity?.appendInTransaction !== "function") {
    throw new TypeError("integrity.appendInTransaction is required");
  }

  return Object.freeze({
    async run({
      identity,
      modelId,
      useCaseId,
      dataPolicyId,
      locale,
      region,
      dataClasses,
      sensitiveData = false,
      prompt,
      syntheticOutput,
      toolProposals,
      correlationId,
    } = {}) {
      const principal = identity?.principal ?? {};
      const tenantId = required(principal.tenantId, "identity.principal.tenantId");
      const principalId = required(principal.id, "identity.principal.id");
      const principalKind = required(
        principal.kind ?? "unknown",
        "identity.principal.kind",
      );
      const normalizedModelId = required(modelId, "modelId");
      const normalizedUseCaseId = required(useCaseId, "useCaseId");
      const normalizedDataPolicyId = required(dataPolicyId, "dataPolicyId");
      const normalizedLocale = required(locale, "locale");
      const normalizedRegion = required(region, "region");
      const normalizedDataClasses = stringArray(dataClasses, "dataClasses");
      const normalizedPrompt = nonEmptyText(prompt, "prompt");
      const normalizedOutput = nonEmptyText(syntheticOutput, "syntheticOutput");
      const normalizedToolProposals = toolProposalArray(toolProposals);
      const normalizedCorrelationId = required(correlationId, "correlationId");

      const admissionDecision = await admissionGate.evaluate({
        identity,
        modelId: normalizedModelId,
        useCaseId: normalizedUseCaseId,
        dataPolicyId: normalizedDataPolicyId,
        locale: normalizedLocale,
        toolIds: stringArray(
          [...new Set(normalizedToolProposals.map((proposal) => proposal.toolId))],
          "toolIds",
          MAX_TOOL_PROPOSALS,
        ),
        dataClasses: normalizedDataClasses,
        region: normalizedRegion,
        sensitiveData: Boolean(sensitiveData),
        correlationId: normalizedCorrelationId,
      });

      const promptDecision = await promptDefense.evaluate({
        identity,
        prompt: normalizedPrompt,
        sourceType: "user",
        useCaseId: normalizedUseCaseId,
        dataPolicyId: normalizedDataPolicyId,
        correlationId: normalizedCorrelationId,
      });

      const outputDecision = await outputValidator.evaluate({
        identity,
        output: normalizedOutput,
        sourceType: "model_output",
        useCaseId: normalizedUseCaseId,
        dataPolicyId: normalizedDataPolicyId,
        modelId: normalizedModelId,
        correlationId: normalizedCorrelationId,
      });

      const toolDecisions = [];
      for (let index = 0; index < normalizedToolProposals.length; index += 1) {
        const proposal = normalizedToolProposals[index];
        toolDecisions.push(await toolInvocationGuard.evaluate({
          identity,
          proposal: {
            ...proposal,
            useCase: proposal.useCase ?? normalizedUseCaseId,
            correlationId:
              proposal.correlationId
              ?? `${normalizedCorrelationId}:tool:${index + 1}`,
          },
        }));
      }

      const allDecisions = [
        admissionDecision,
        promptDecision,
        outputDecision,
        ...toolDecisions,
      ];
      const outcome = aggregateOutcome(allDecisions);

      const candidates = [
        candidate({
          decision: promptDecision,
          category: "prompt_injection",
          sourceType: "prompt_defense",
          order: 0,
        }),
        candidate({
          decision: outputDecision,
          category:
            outputDecision.reasonCodes.includes("secret_material_detected")
            || outputDecision.reasonCodes.includes("personal_data_detected")
              ? "data_exposure"
              : "unsafe_output",
          sourceType: "output_validator",
          order: 1,
        }),
        ...toolDecisions.map((decision, index) => candidate({
          decision,
          category: "tool_misuse",
          sourceType: "tool_guard",
          order: 2 + index,
        })),
        candidate({
          decision: admissionDecision,
          category: "policy_violation",
          sourceType: "risk_engine",
          order: 100,
        }),
      ].filter(Boolean)
        .sort((left, right) => right.score - left.score || left.order - right.order);

      const evidenceRefs = Object.freeze([
        decisionRef("admission", admissionDecision),
        decisionRef("prompt_defense", promptDecision),
        decisionRef("output_validator", outputDecision),
        ...toolDecisions.map((decision) => decisionRef("tool_guard", decision)),
      ]);

      let incident = null;
      if (outcome !== "allow") {
        const primary = candidates[0];
        incident = await incidentQueue.create({
          identity,
          category: primary.category,
          severity: primary.severity,
          sourceType: primary.sourceType,
          correlationId: normalizedCorrelationId,
          evidenceRefs,
        });
      }

      const simulation = Object.freeze({
        contractType: "GlobalTrustSafetySimulation",
        contractVersion: "1.0",
        simulationId: required(simulationIdFactory(), "simulationId"),
        tenantId,
        principalId,
        principalKind,
        modelId: normalizedModelId,
        useCaseId: normalizedUseCaseId,
        dataPolicyId: normalizedDataPolicyId,
        locale: normalizedLocale,
        region: normalizedRegion,
        dataClasses: normalizedDataClasses,
        sensitiveData: Boolean(sensitiveData),
        outcome,
        admitted: outcome === "allow",
        humanReviewRequired: outcome === "review",
        admission: freezeSummary(admissionDecision, "admission"),
        promptDefense: freezeSummary(promptDecision, "prompt_defense"),
        outputValidation: freezeSummary(outputDecision, "output_validator"),
        toolDecisions: Object.freeze(
          toolDecisions.map((decision) => freezeSummary(decision, "tool_guard")),
        ),
        evidenceRefs,
        incidentId: incident?.incidentId ?? null,
        scenarioFingerprint: sha256Canonical({
          tenantId,
          modelId: normalizedModelId,
          useCaseId: normalizedUseCaseId,
          dataPolicyId: normalizedDataPolicyId,
          locale: normalizedLocale,
          region: normalizedRegion,
          dataClasses: normalizedDataClasses,
          sensitiveData: Boolean(sensitiveData),
          promptHash: promptDecision.promptHash,
          outputHash: outputDecision.outputHash,
          toolArgumentHashes: toolDecisions.map((decision) => decision.argumentHash),
        }),
        correlationId: normalizedCorrelationId,
        simulatedAt: required(now(), "simulatedAt"),
        promptContentIncluded: false,
        outputContentIncluded: false,
        toolArgumentsIncluded: false,
        secretMaterialIncluded: false,
        inferenceExecuted: false,
        modelExecuted: false,
        toolExecuted: false,
        providerContacted: false,
        automaticRemediationExecuted: false,
      });

      const transaction = await store.transaction((tx) => {
        tx.put(
          SAFETY_SIMULATION_COLLECTION,
          simulation.simulationId,
          simulation,
          { ifAbsent: true },
        );
        integrity.appendInTransaction(tx, {
          tenantId,
          recordId: simulation.simulationId,
          payload: simulation,
        });
        return simulation;
      });

      return transaction.result;
    },

    async listTenant({ tenantId, limit = 100 } = {}) {
      const tenant = required(tenantId, "tenantId");
      const normalizedLimit = Number(limit);
      if (
        !Number.isInteger(normalizedLimit)
        || normalizedLimit < 1
        || normalizedLimit > 500
      ) {
        throw new RangeError("limit must be an integer between 1 and 500");
      }
      const transaction = await store.transaction((tx) =>
        tx.list(SAFETY_SIMULATION_COLLECTION)
          .map(({ value }) => value)
          .filter((simulation) => simulation?.tenantId === tenant)
          .sort((left, right) =>
            right.simulatedAt.localeCompare(left.simulatedAt)
            || left.simulationId.localeCompare(right.simulationId)
          )
          .slice(0, normalizedLimit)
      );
      return Object.freeze(transaction.result);
    },
  });
}
