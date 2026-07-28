import { randomUUID } from "node:crypto";

import { sha256Canonical } from "./canonical-hash.mjs";
import { createGlobalTrustPromptDefenseIntegrity } from "./global-trust-prompt-defense-integrity.mjs";

export const GLOBAL_TRUST_PROMPT_DEFENSE_DECISION_COLLECTION =
  "global_trust_prompt_defense_decisions";

const MAX_PROMPT_BYTES = 32 * 1024;
const SOURCE_TYPES = new Set(["user", "retrieved", "tool_output"]);

const RULES = Object.freeze([
  Object.freeze({
    code: "instruction_override_attempt",
    severity: 3,
    patterns: Object.freeze([
      /\bignore\s+(?:all\s+)?(?:previous|prior|earlier)\s+(?:instructions?|messages?|rules?)\b/i,
      /\bdisregard\s+(?:the\s+)?(?:system|developer|previous|prior)\b/i,
      /\boverride\s+(?:the\s+)?(?:system|developer|safety|policy)\b/i,
      /\bbypass\s+(?:the\s+)?(?:safety|guardrails?|policy|restrictions?)\b/i,
    ]),
  }),
  Object.freeze({
    code: "hidden_instruction_extraction_attempt",
    severity: 4,
    patterns: Object.freeze([
      /\b(?:show|reveal|print|repeat|expose|return)\s+(?:the\s+)?(?:system|developer|hidden|internal)\s+(?:prompt|instructions?|message)\b/i,
      /\bwhat\s+(?:is|are)\s+your\s+(?:system|developer|hidden)\s+(?:prompt|instructions?)\b/i,
    ]),
  }),
  Object.freeze({
    code: "secret_exfiltration_attempt",
    severity: 4,
    patterns: Object.freeze([
      /\b(?:show|reveal|print|return|extract|exfiltrate)\b.{0,48}\b(?:api[\s_-]?key|token|password|secret|private[\s_-]?key|credentials?|\.env)\b/i,
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
      /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i,
    ]),
  }),
  Object.freeze({
    code: "privileged_tool_escalation_attempt",
    severity: 4,
    patterns: Object.freeze([
      /\b(?:run|execute|open)\s+(?:a\s+)?(?:shell|terminal|command prompt)\b/i,
      /\b(?:raw\s+sql|drop\s+table|delete\s+all|format\s+disk)\b/i,
      /\b(?:deploy|release|merge|change\s+dns|restart\s+server)\b.{0,64}\b(?:without|skip|bypass)\b/i,
    ]),
  }),
  Object.freeze({
    code: "role_manipulation_attempt",
    severity: 2,
    patterns: Object.freeze([
      /\byou\s+are\s+now\s+(?:an?\s+)?(?:unrestricted|uncensored|developer|administrator|root)\b/i,
      /\bact\s+as\s+(?:an?\s+)?(?:unrestricted|uncensored|root|administrator)\b/i,
      /\bdeveloper\s+mode\b/i,
      /\bjailbreak\b/i,
    ]),
  }),
  Object.freeze({
    code: "encoded_payload_suspected",
    severity: 2,
    patterns: Object.freeze([
      /\b(?:base64|rot13|hex)\b.{0,40}\b(?:decode|execute|instructions?|payload)\b/i,
      /(?:[A-Za-z0-9+/]{80,}={0,2})/,
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

function normalizePrompt(value) {
  if (typeof value !== "string") throw new TypeError("prompt must be a string");
  const prompt = value.normalize("NFC");
  const promptBytes = Buffer.byteLength(prompt, "utf8");
  if (promptBytes < 1) throw new TypeError("prompt must not be empty");
  if (promptBytes > MAX_PROMPT_BYTES) {
    throw new RangeError(`prompt must not exceed ${MAX_PROMPT_BYTES} bytes`);
  }
  return Object.freeze({
    prompt,
    promptBytes,
    promptCharacterCount: [...prompt].length,
    promptHash: sha256Canonical(prompt),
  });
}

function inspectPrompt(prompt) {
  const matches = [];
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(prompt))) {
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
        : ["no_threat_detected"],
    ),
  });
}

export function createGlobalTrustPromptDefense({
  store,
  integrity = createGlobalTrustPromptDefenseIntegrity({ store }),
  decisionIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction is required");
  }
  if (typeof integrity?.appendInTransaction !== "function") {
    throw new TypeError("integrity.appendInTransaction is required");
  }
  if (typeof decisionIdFactory !== "function") {
    throw new TypeError("decisionIdFactory is required");
  }
  if (typeof now !== "function") throw new TypeError("now is required");

  return Object.freeze({
    async evaluate({
      identity,
      prompt,
      sourceType = "user",
      useCaseId,
      dataPolicyId,
      correlationId,
    } = {}) {
      const principal = identity?.principal ?? {};
      const tenantId = required(principal.tenantId, "identity.principal.tenantId");
      const principalId = required(principal.id, "identity.principal.id");
      const principalKind = required(
        principal.kind ?? "unknown",
        "identity.principal.kind",
      );
      const normalizedSourceType = required(sourceType, "sourceType");
      if (!SOURCE_TYPES.has(normalizedSourceType)) {
        throw new TypeError("sourceType must be user, retrieved, or tool_output");
      }

      const normalizedPrompt = normalizePrompt(prompt);
      const inspection = inspectPrompt(normalizedPrompt.prompt);
      const decision = Object.freeze({
        contractType: "PromptDefenseDecision",
        contractVersion: "1.0",
        decisionId: required(decisionIdFactory(), "decisionId"),
        tenantId,
        principalId,
        principalKind,
        sourceType: normalizedSourceType,
        useCaseId: required(useCaseId, "useCaseId"),
        dataPolicyId: required(dataPolicyId, "dataPolicyId"),
        policyVersion: "prompt-defense-v1",
        outcome: inspection.outcome,
        riskLevel: inspection.riskLevel,
        reasonCodes: inspection.reasonCodes,
        humanReviewRequired: inspection.outcome === "review",
        promptHash: normalizedPrompt.promptHash,
        promptBytes: normalizedPrompt.promptBytes,
        promptCharacterCount: normalizedPrompt.promptCharacterCount,
        promptContentIncluded: false,
        promptPersisted: false,
        modelExecuted: false,
        toolExecuted: false,
        providerContacted: false,
        correlationId: required(correlationId, "correlationId"),
        evaluatedAt: required(now(), "evaluatedAt"),
        sensitiveContentIncluded: false,
      });

      const transaction = await store.transaction((tx) => {
        tx.put(
          GLOBAL_TRUST_PROMPT_DEFENSE_DECISION_COLLECTION,
          decision.decisionId,
          decision,
          { ifAbsent: true },
        );
        integrity.appendInTransaction(tx, {
          tenantId,
          sourceCollection:
            GLOBAL_TRUST_PROMPT_DEFENSE_DECISION_COLLECTION,
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
        tx.list(GLOBAL_TRUST_PROMPT_DEFENSE_DECISION_COLLECTION)
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
