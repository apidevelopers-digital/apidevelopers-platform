import { randomUUID } from "node:crypto";

import { assertToolInvocationPolicyContract } from "@apidevelopers/contracts";

import { sha256Canonical } from "./canonical-hash.mjs";
import { createGlobalTrustIntegrityService } from "./global-trust-integrity.mjs";

export const GLOBAL_TRUST_TOOL_INVOCATION_DECISION_COLLECTION =
  "global_trust_tool_invocation_decisions";

const EXECUTION_CLASSES = new Set(["read", "write", "administrative"]);
const MAX_ARGUMENT_BYTES = 16 * 1024;
const MAX_ARGUMENT_DEPTH = 5;
const MAX_ARGUMENT_KEYS = 100;
const ADMINISTRATIVE_ACTION_PREFIXES = Object.freeze([
  "admin.",
  "database.migrate",
  "deploy",
  "dns.",
  "production.",
  "release",
  "repo.merge",
  "server.restart",
  "server.start",
  "server.stop",
  "shell.",
  "sql.raw",
]);
const FORBIDDEN_ARGUMENT_KEYS = new Set([
  "apikey",
  "authorization",
  "bearer",
  "command",
  "cookie",
  "databaseurl",
  "dsn",
  "env",
  "environment",
  "password",
  "passwd",
  "privatekey",
  "rawsql",
  "script",
  "secret",
  "secrets",
  "shell",
  "sql",
  "token",
]);
const SENSITIVE_VALUE_PATTERNS = Object.freeze([
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  /\b(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^/\s]+@/i,
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

function normalizeKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function inspectArguments(argumentsValue) {
  const reasons = [];
  const seen = new WeakSet();
  let keyCount = 0;

  function addReason(code) {
    if (!reasons.includes(code)) reasons.push(code);
  }

  function visit(value, depth) {
    if (depth > MAX_ARGUMENT_DEPTH) {
      addReason("argument_depth_exceeded");
      return;
    }

    if (
      value === null
      || typeof value === "string"
      || typeof value === "number"
      || typeof value === "boolean"
    ) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        addReason("argument_non_finite_number");
      }
      if (
        typeof value === "string"
        && SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))
      ) {
        addReason("sensitive_argument_value_blocked");
      }
      return;
    }

    if (
      typeof value === "undefined"
      || typeof value === "function"
      || typeof value === "symbol"
      || typeof value === "bigint"
    ) {
      addReason("unsupported_argument_value");
      return;
    }

    if (typeof value !== "object") {
      addReason("unsupported_argument_value");
      return;
    }

    if (seen.has(value)) {
      addReason("cyclic_arguments_blocked");
      return;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }

    if (!isPlainObject(value)) {
      addReason("non_plain_argument_object");
      return;
    }

    for (const [key, item] of Object.entries(value)) {
      keyCount += 1;
      if (keyCount > MAX_ARGUMENT_KEYS) addReason("argument_key_limit_exceeded");
      if (FORBIDDEN_ARGUMENT_KEYS.has(normalizeKey(key))) {
        addReason("forbidden_argument_key");
      }
      visit(item, depth + 1);
    }
  }

  if (!isPlainObject(argumentsValue)) {
    addReason("arguments_must_be_object");
  } else {
    visit(argumentsValue, 0);
  }

  let argumentBytes = 0;
  let argumentHash = null;
  if (!reasons.includes("cyclic_arguments_blocked")) {
    try {
      const serialized = JSON.stringify(argumentsValue);
      if (typeof serialized !== "string") {
        addReason("arguments_not_serializable");
      } else {
        argumentBytes = Buffer.byteLength(serialized, "utf8");
        if (argumentBytes > MAX_ARGUMENT_BYTES) addReason("argument_size_exceeded");
        argumentHash = sha256Canonical(argumentsValue);
      }
    } catch {
      addReason("arguments_not_serializable");
    }
  }

  return Object.freeze({
    valid: reasons.length === 0,
    reasonCodes: Object.freeze([...reasons]),
    argumentBytes,
    argumentKeyCount: keyCount,
    argumentHash,
  });
}

function normalizeProposal(proposal = {}) {
  const executionClass = required(
    proposal.executionClass ?? "read",
    "proposal.executionClass",
  );
  if (!EXECUTION_CLASSES.has(executionClass)) {
    throw new TypeError(
      "proposal.executionClass must be read, write, or administrative",
    );
  }

  return Object.freeze({
    toolId: required(proposal.toolId, "proposal.toolId"),
    action: required(proposal.action, "proposal.action"),
    useCase: required(proposal.useCase, "proposal.useCase"),
    correlationId: required(proposal.correlationId, "proposal.correlationId"),
    callCount: positiveInteger(
      proposal.callCount ?? 1,
      "proposal.callCount",
      1_000,
    ),
    executionClass,
    arguments: proposal.arguments ?? {},
  });
}

function isAdministrativeAction(action) {
  const normalized = String(action).toLowerCase();
  return ADMINISTRATIVE_ACTION_PREFIXES.some((prefix) =>
    normalized === prefix || normalized.startsWith(prefix)
  );
}

function policyKey(tenantId, toolId) {
  return `${tenantId}\u0000${toolId}`;
}

export function createGlobalTrustToolInvocationGuard({
  store,
  integrity = createGlobalTrustIntegrityService({ store }),
  policies = [],
  decisionIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction is required");
  }
  if (typeof integrity?.appendInTransaction !== "function") {
    throw new TypeError("integrity.appendInTransaction is required");
  }
  if (!Array.isArray(policies)) throw new TypeError("policies must be an array");
  if (typeof decisionIdFactory !== "function") {
    throw new TypeError("decisionIdFactory is required");
  }
  if (typeof now !== "function") throw new TypeError("now is required");

  const policyMap = new Map();
  for (const policy of policies) {
    assertToolInvocationPolicyContract(policy);
    const key = policyKey(policy.tenantId, policy.toolId);
    if (policyMap.has(key)) {
      throw new TypeError(
        `duplicate tool invocation policy for tenant ${policy.tenantId} and tool ${policy.toolId}`,
      );
    }
    policyMap.set(key, policy);
  }

  return Object.freeze({
    async evaluate({ identity, proposal } = {}) {
      const principal = identity?.principal ?? {};
      const tenantId = required(principal.tenantId, "identity.principal.tenantId");
      const principalId = required(principal.id, "identity.principal.id");
      const principalKind = required(
        principal.kind ?? "unknown",
        "identity.principal.kind",
      );
      const normalized = normalizeProposal(proposal);
      const policy = policyMap.get(policyKey(tenantId, normalized.toolId));
      const inspection = inspectArguments(normalized.arguments);
      const reasonCodes = [];

      if (!policy) {
        reasonCodes.push("policy_not_found");
      } else {
        if (policy.deniedActions.includes(normalized.action)) {
          reasonCodes.push("action_explicitly_denied");
        }
        if (!policy.allowedActions.includes(normalized.action)) {
          reasonCodes.push("action_not_allowlisted");
        }
        if (normalized.callCount > policy.maxCallsPerRequest) {
          reasonCodes.push("max_calls_exceeded");
        }
      }

      if (
        normalized.executionClass === "administrative"
        || isAdministrativeAction(normalized.action)
      ) {
        reasonCodes.push("administrative_execution_blocked");
      }

      reasonCodes.push(...inspection.reasonCodes);

      const blocked = reasonCodes.length > 0;
      const outcome = blocked
        ? "deny"
        : policy.humanApprovalRequired
          ? "pending_approval"
          : "allow";

      if (!blocked) {
        reasonCodes.push(
          policy.humanApprovalRequired
            ? "human_approval_required"
            : "policy_allow",
        );
      }

      const decision = Object.freeze({
        contractType: "ToolInvocationGuardDecision",
        contractVersion: "1.0",
        decisionId: required(decisionIdFactory(), "decisionId"),
        tenantId,
        principalId,
        principalKind,
        policyId: policy?.policyId ?? null,
        toolId: normalized.toolId,
        action: normalized.action,
        useCase: normalized.useCase,
        executionClass: normalized.executionClass,
        callCount: normalized.callCount,
        outcome,
        reasonCodes: Object.freeze([...new Set(reasonCodes)]),
        humanApprovalRequired: policy?.humanApprovalRequired === true,
        automaticAdministrativeExecutionAllowed: false,
        argumentHash: inspection.argumentHash,
        argumentBytes: inspection.argumentBytes,
        argumentKeyCount: inspection.argumentKeyCount,
        correlationId: normalized.correlationId,
        decidedAt: required(now(), "decidedAt"),
        sensitiveContentIncluded: false,
      });

      const transaction = await store.transaction((tx) => {
        tx.put(
          GLOBAL_TRUST_TOOL_INVOCATION_DECISION_COLLECTION,
          decision.decisionId,
          decision,
          { ifAbsent: true },
        );
        integrity.appendInTransaction(tx, {
          tenantId,
          sourceCollection: GLOBAL_TRUST_TOOL_INVOCATION_DECISION_COLLECTION,
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
        tx.list(GLOBAL_TRUST_TOOL_INVOCATION_DECISION_COLLECTION)
          .map(({ value }) => value)
          .filter((decision) => decision?.tenantId === tenant)
          .sort((left, right) =>
            right.decidedAt.localeCompare(left.decidedAt)
            || left.decisionId.localeCompare(right.decisionId)
          )
          .slice(0, normalizedLimit)
      );
      return Object.freeze(transaction.result);
    },
  });
}
