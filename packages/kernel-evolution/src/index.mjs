function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function normalizeCheck(check, index) {
  assertObject(check, `auditReport.checks[${index}]`);
  assertString(check.ruleId, `auditReport.checks[${index}].ruleId`);
  const state = check.state ?? "unknown";
  if (!["pass", "warn", "fail", "unknown"].includes(state)) {
    throw new TypeError(`auditReport.checks[${index}].state is invalid`);
  }
  return {
    ruleId: check.ruleId,
    state,
    subject: check.subject ?? "unspecified",
    statement: check.statement ?? "",
    recommendation: check.recommendation ?? null,
    evidence: Array.isArray(check.evidence)
      ? [...new Set(check.evidence.filter(Boolean).map(String))].sort()
      : [],
  };
}

function priorityFor(state) {
  return state === "fail" ? "high" : state === "unknown" ? "medium" : "low";
}

function actionFor(state) {
  return state === "fail" ? "remediate" : state === "unknown" ? "collect-evidence" : "review";
}

function proposalId(check, index) {
  const clean = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `proposal.${String(index + 1).padStart(3, "0")}.${clean(check.ruleId)}.${clean(check.subject)}`;
}

export const evolutionStatuses = Object.freeze([
  "stable",
  "changes-proposed",
  "blocked-by-evidence",
]);

export const evolutionActions = Object.freeze([
  "review",
  "collect-evidence",
  "remediate",
]);

export class EvolutionEngine {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") throw new TypeError("clock must be a function");
    this.clock = clock;
  }

  propose(auditReport, { requestedBy = "system", scope = "kernel" } = {}) {
    assertObject(auditReport, "auditReport");
    assertString(auditReport.auditId, "auditReport.auditId");
    assertString(requestedBy, "requestedBy");
    assertString(scope, "scope");
    if (!Array.isArray(auditReport.checks)) {
      throw new TypeError("auditReport.checks must be an array");
    }

    const before = clone(auditReport);
    const checks = auditReport.checks.map(normalizeCheck);
    const actionable = checks
      .filter((check) => check.state !== "pass")
      .sort((left, right) =>
        left.ruleId.localeCompare(right.ruleId) ||
        String(left.subject).localeCompare(String(right.subject)) ||
        left.state.localeCompare(right.state)
      );

    const proposals = actionable.map((check, index) => deepFreeze({
      proposalId: proposalId(check, index),
      sourceRuleId: check.ruleId,
      subject: check.subject,
      priority: priorityFor(check.state),
      action: actionFor(check.state),
      title: check.recommendation ?? check.statement ?? `Review ${check.ruleId}`,
      rationale: check.statement || `Audit check ${check.ruleId} requires attention.`,
      preconditions: check.state === "unknown"
        ? ["attach-verifiable-evidence", "human-review"]
        : ["human-review"],
      evidence: clone(check.evidence),
      humanReviewRequired: true,
      mutationAllowed: false,
      approvalAllowed: false,
      executionAllowed: false,
    }));

    const hasFailure = actionable.some((check) => check.state === "fail");
    const hasUnknown = actionable.some((check) => check.state === "unknown");
    const status = proposals.length === 0
      ? "stable"
      : hasUnknown && !hasFailure
        ? "blocked-by-evidence"
        : "changes-proposed";

    if (JSON.stringify(before) !== JSON.stringify(auditReport)) {
      throw new Error("auditReport was mutated");
    }

    const generatedAt = this.clock();
    assertString(generatedAt, "clock result");

    return deepFreeze({
      evolutionId: `evolution.${generatedAt.replace(/[:\-.TZ]/g, "").toLowerCase()}`,
      generatedAt,
      requestedBy,
      scope,
      sourceAuditId: auditReport.auditId,
      sourceAuditStatus: auditReport.status ?? null,
      mode: "advisory",
      status,
      proposals,
      summary: {
        total: proposals.length,
        high: proposals.filter((item) => item.priority === "high").length,
        medium: proposals.filter((item) => item.priority === "medium").length,
        low: proposals.filter((item) => item.priority === "low").length,
      },
      constraints: {
        mutationAllowed: false,
        executionAllowed: false,
        automaticApprovalAllowed: false,
        humanApprovalRequired: true,
        evidenceRequiredBeforePromotion: true,
      },
    });
  }
}

export function createEvolutionEngine(options = {}) {
  return new EvolutionEngine(options);
}
