import { randomUUID } from "node:crypto";

import { sha256Canonical } from "./canonical-hash.mjs";
import {
  OUTPUT_VALIDATOR_DECISION_COLLECTION,
  createGlobalTrustOutputValidatorIntegrity,
} from "./global-trust-output-validator-integrity.mjs";

const MAX_OUTPUT_BYTES = 64 * 1024;
const SOURCE_TYPES = new Set(["model_output", "tool_output", "retrieved"]);

const RULES = Object.freeze([
  Object.freeze({
    code: "secret_material_detected",
    severity: 4,
    patterns: Object.freeze([
      /\b(?:api[\s_-]?key|access[\s_-]?token|password|secret|private[\s_-]?key|credentials?)\b\s*[:=]\s*[^\s,;]{8,}/i,
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
      /\bBearer\s+[A-Za-z0-9._~+\/=-]{16,}\b/i,
    ]),
  }),
  Object.freeze({
    code: "unsafe_privileged_action",
    severity: 4,
    patterns: Object.freeze([
      /\b(?:run|execute|open)\s+(?:a\s+)?(?:shell|terminal|command prompt)\b/i,
      /\b(?:deploy|release|merge|change\s+dns|restart\s+server)\b.{0,64}\b(?:without|skip|bypass)\b/i,
      /\b(?:drop\s+table|delete\s+all|format\s+disk)\b/i,
    ]),
  }),
  Object.freeze({
    code: "active_content_detected",
    severity: 4,
    patterns: Object.freeze([
      /<script\b[^>]*>/i,
      /\bjavascript\s*:/i,
      /\bon(?:error|load|click)\s*=/i,
    ]),
  }),
  Object.freeze({
    code: "hidden_instruction_disclosure",
    severity: 3,
    patterns: Object.freeze([
      /\b(?:system prompt|developer message|hidden instructions?|internal policy)\b/i,
      /\b(?:ignore|override|disregard)\s+(?:the\s+)?(?:system|developer|safety)\b/i,
    ]),
  }),
  Object.freeze({
    code: "personal_data_detected",
    severity: 2,
    patterns: Object.freeze([
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
      /\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9?\d{4})[-\s]?\d{4}\b/,
      /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
    ]),
  }),
]);

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function positiveInteger(value, name, maximum = 1_000) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > maximum) {
    throw new RangeError(`${name} must be an integer between 1 and ${maximum}`);
  }
  return normalized;
}

function normalizeOutput(value) {
  if (typeof value !== "string") throw new TypeError("output must be a string");
  const output = value.normalize("NFC");
  const outputBytes = Buffer.byteLength(output, "utf8");
  if (outputBytes < 1) throw new TypeError("output must not be empty");
  if (outputBytes > MAX_OUTPUT_BYTES) {
    throw new RangeError(`output must not exceed ${MAX_OUTPUT_BYTES} bytes`);
  }
  return Object.freeze({
    output,
    outputBytes,
    outputCharacterCount: [...output].length,
    outputHash: sha256Canonical(output),
  });
}

function inspectOutput(output) {
  const matches = [];
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(output))) {
      matches.push(Object.freeze({ code: rule.code, severity: rule.severity }));
    }
  }

  const maxSeverity = matches.reduce(
    (current, match) => Math.max(current, match.severity),
    0,
  );
  const riskLevel =
    maxSeverity >= 4
      ? "critical"
      : maxSeverity === 3
        ? "high"
        : maxSeverity === 2
          ? "moderate"
          : "low";
  const outcome =
    maxSeverity >= 4
      ? "deny"
      : maxSeverity >= 2
        ? "review"
        : "allow";

  return Object.freeze({
    riskLevel,
    outcome,
    reasonCodes: Object.freeze(
      matches.length
        ? [...new Set(matches.map((match) => match.code))].sort()
        : ["no_output_risk_detected"],
    ),
  });
}

export function createGlobalTrustOutputValidator({
  store,
  integrity = createGlobalTrustOutputValidatorIntegrity({ store }),
  decisionIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction is required");
  }
  if (typeof integrity?.appendInTransaction !== "function") {
    throw new TypeError("integrity.appendInTransaction is required");
  }

  return Object.freeze({
    async evaluate({
      identity,
      output,
      sourceType = "model_output",
      useCaseId,
      dataPolicyId,
      modelId,
      correlationId,
    } = {}) {
      const principal = identity?.principal ?? {};
      const tenantId = required(
        principal.tenantId,
        "identity.principal.tenantId",
      );
      const principalId = required(principal.id, "identity.principal.id");
      const principalKind = required(
        principal.kind ?? "unknown",
        "identity.principal.kind",
      );
      const normalizedSourceType = required(sourceType, "sourceType");
      if (!SOURCE_TYPES.has(normalizedSourceType)) {
        throw new TypeError("sourceType must be model_output, tool_output, or retrieved");
      }

      const normalized = normalizeOutput(output);
      const inspection = inspectOutput(normalized.output);
      const decision = Object.freeze({
        contractType: "OutputValidationDecision",
        contractVersion: "1.0",
        decisionId: required(decisionIdFactory(), "decisionId"),
        tenantId,
        principalId,
        principalKind,
        sourceType: normalizedSourceType,
        useCaseId: required(useCaseId, "useCaseId"),
        dataPolicyId: required(dataPolicyId, "dataPolicyId"),
        modelId: modelId === undefined ? null : required(modelId, "modelId"),
        policyVersion: "output-validator-v1",
        outcome: inspection.outcome,
        riskLevel: inspection.riskLevel,
        reasonCodes: inspection.reasonCodes,
        humanReviewRequired: inspection.outcome === "review",
        outputHash: normalized.outputHash,
        outputBytes: normalized.outputBytes,
        outputCharacterCount: normalized.outputCharacterCount,
        outputContentIncluded: false,
        outputPersisted: false,
        modelExecuted: false,
        toolExecuted: false,
        providerContacted: false,
        correlationId: required(correlationId, "correlationId"),
        evaluatedAt: required(now(), "evaluatedAt"),
        sensitiveContentIncluded: false,
      });

      const transaction = await store.transaction((tx) => {
        tx.put(
          OUTPUT_VALIDATOR_DECISION_COLLECTION,
          decision.decisionId,
          decision,
          { ifAbsent: true },
        );
        integrity.appendInTransaction(tx, {
          tenantId,
          sourceCollection: OUTPUT_VALIDATOR_DECISION_COLLECTION,
          recordId: decision.decisionId,
          payload: decision,
        });
        return decision;
      });
      return transaction.result;
    },

    async listTenant({ tenantId, limit = 100 } = {}) {
      const tenant = required(tenantId, "tenantId");
      const normalizedLimit = positiveInteger(limit, "limit", 500);
      const transaction = await store.transaction((tx) =>
        tx.list(OUTPUT_VALIDATOR_DECISION_COLLECTION)
          .map(({ value }) => value)
          .filter((decision) => decision?.tenantId === tenant)
          .sort((left, right) =>
            right.evaluatedAt.localeCompare(left.evaluatedAt)
            || left.decisionId.localeCompare(right.decisionId)
          )
          .slice(0, normalizedLimit)
      );
      return Object.freeze(transaction.result);
    },
  });
}
