function clone(value) {
  return value == null ? value : structuredClone(value);
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

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function same(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function check(ruleId, state, subject, statement, recommendation = null, evidence = []) {
  return {
    ruleId,
    state,
    subject,
    statement,
    recommendation,
    evidence: [...new Set(evidence.filter(Boolean))].sort(),
  };
}

function statusFor(checks) {
  if (checks.some((item) => item.state === "fail")) return "non-compliant";
  if (checks.some((item) => item.state === "unknown")) return "insufficient-evidence";
  if (checks.some((item) => item.state === "warn")) return "attention";
  return "compliant";
}

function evidenceIds(records) {
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => record?.evidenceId)
    .filter(Boolean)
    .map(String)
    .sort();
}

function auditTraceability({ decision, plan, policyDecision, runtimeReport }) {
  const mismatches = [];

  if (plan?.decisionId && plan.decisionId !== decision.decisionId) {
    mismatches.push("plan.decisionId");
  }
  if (
    plan?.proposalId &&
    decision.selectedProposalId &&
    plan.proposalId !== decision.selectedProposalId
  ) {
    mismatches.push("plan.proposalId");
  }
  if (
    runtimeReport?.decisionId &&
    runtimeReport.decisionId !== decision.decisionId
  ) {
    mismatches.push("runtimeReport.decisionId");
  }
  if (runtimeReport?.planId && plan?.planId && runtimeReport.planId !== plan.planId) {
    mismatches.push("runtimeReport.planId");
  }
  if (
    runtimeReport?.proposalId &&
    plan?.proposalId &&
    runtimeReport.proposalId !== plan.proposalId
  ) {
    mismatches.push("runtimeReport.proposalId");
  }
  if (
    policyDecision?.planHash &&
    policyDecision?.planHash !== plan?.planHash &&
    plan?.planHash
  ) {
    mismatches.push("policyDecision.planHash");
  }

  return mismatches;
}

function auditDecision(decision) {
  const safe =
    decision.decisionState === "ready-for-human-decision" &&
    decision.humanApprovalRequired === true &&
    decision.approved === false &&
    decision.mutationAllowed === false &&
    decision.executionAllowed === false &&
    decision.constraints?.automaticDecisionAllowed === false &&
    decision.constraints?.automaticApprovalAllowed === false &&
    decision.constraints?.automaticExecutionAllowed === false;

  return safe;
}

function auditApproval({ approval, decision, plan, tenantId }) {
  if (!approval) return { state: "unknown", evidence: [] };

  const failures = [];
  if (!approval.approvalId) failures.push("approvalId");
  if (approval.status !== "approved") failures.push("status");
  if (!approval.approvedBy) failures.push("approvedBy");
  if (approval.tenantId !== tenantId) failures.push("tenantId");
  if (approval.decisionId !== decision.decisionId) failures.push("decisionId");
  if (approval.proposalId !== plan.proposalId) failures.push("proposalId");
  if (approval.consumedAt || approval.used === true) failures.push("replayed");

  return {
    state: failures.length ? "fail" : "pass",
    evidence: [approval.approvalId].filter(Boolean),
  };
}

function auditRuntime({ runtimeReport, policyDecision, approval }) {
  if (!runtimeReport) return { state: "unknown", evidence: [] };

  if (runtimeReport.dryRun === true) {
    const previewSafe =
      runtimeReport.state === "previewed" &&
      runtimeReport.steps?.every((step) => step.status === "previewed");
    return {
      state: previewSafe ? "pass" : "fail",
      evidence: [runtimeReport.reportId].filter(Boolean),
    };
  }

  const executed = runtimeReport.state === "executed";
  const noFailures =
    Array.isArray(runtimeReport.steps) &&
    runtimeReport.steps.length > 0 &&
    runtimeReport.steps.every((step) => step.status === "executed");
  const policyAllowed =
    policyDecision?.effect === "allow" &&
    policyDecision?.executionAllowed === true &&
    policyDecision?.mutationAllowed === true;
  const approvalPresent = approval?.status === "approved";

  return {
    state: executed && noFailures && policyAllowed && approvalPresent ? "pass" : "fail",
    evidence: [
      runtimeReport.reportId,
      policyDecision?.policyDecisionId,
      approval?.approvalId,
    ].filter(Boolean),
  };
}

function auditEvidence(records, verifyEvidence) {
  if (!Array.isArray(records) || records.length === 0) {
    return { state: "unknown", evidence: [] };
  }

  const valid = records.every((record) => {
    if (!record || typeof record !== "object") return false;
    if (!record.evidenceId || record.status !== "active") return false;
    if (typeof verifyEvidence === "function" && !verifyEvidence(record)) return false;
    return true;
  });

  return {
    state: valid ? "pass" : "fail",
    evidence: evidenceIds(records),
  };
}

export class AuditEngine {
  constructor({
    clock = () => new Date().toISOString(),
    verifyEvidence,
  } = {}) {
    if (typeof clock !== "function") throw new TypeError("clock must be a function");
    if (verifyEvidence != null && typeof verifyEvidence !== "function") {
      throw new TypeError("verifyEvidence must be a function");
    }
    this.clock = clock;
    this.verifyEvidence = verifyEvidence;
  }

  audit(
    {
      tenantId,
      decision,
      plan,
      policyDecision = null,
      approval = null,
      runtimeReport = null,
      evidence = [],
    } = {},
    { requestedBy = "system", scope = "lifecycle" } = {},
  ) {
    assertString(tenantId, "tenantId");
    assertObject(decision, "decision");
    assertObject(plan, "plan");
    assertString(decision.decisionId, "decision.decisionId");
    assertString(plan.planId, "plan.planId");

    const before = clone({
      tenantId,
      decision,
      plan,
      policyDecision,
      approval,
      runtimeReport,
      evidence,
    });

    const traceabilityMismatches = auditTraceability({
      decision,
      plan,
      policyDecision,
      runtimeReport,
    });
    const decisionSafe = auditDecision(decision);
    const approvalAudit = auditApproval({ approval, decision, plan, tenantId });
    const runtimeAudit = auditRuntime({ runtimeReport, policyDecision, approval });
    const evidenceAudit = auditEvidence(evidence, this.verifyEvidence);

    const checks = [
      check(
        "AUD-001",
        traceabilityMismatches.length ? "fail" : "pass",
        decision.decisionId,
        traceabilityMismatches.length
          ? `Traceability mismatches: ${traceabilityMismatches.join(", ")}.`
          : "Decision, plan, policy and runtime references are traceable.",
        traceabilityMismatches.length
          ? "Align lifecycle artifact identifiers before promotion."
          : null,
        [
          decision.decisionId,
          plan.planId,
          policyDecision?.policyDecisionId,
          runtimeReport?.reportId,
        ],
      ),
      check(
        "AUD-002",
        decisionSafe ? "pass" : "fail",
        decision.decisionId,
        decisionSafe
          ? "Decision preserves human authority and blocks automatic execution."
          : "Decision governance invariants are not satisfied.",
        decisionSafe
          ? null
          : "Restore human approval and automatic decision/execution prohibitions.",
        [decision.decisionId],
      ),
      check(
        "AUD-003",
        approvalAudit.state,
        decision.decisionId,
        approvalAudit.state === "pass"
          ? "Approval is present and bound to tenant, decision and proposal."
          : approvalAudit.state === "unknown"
            ? "No approval artifact was supplied."
            : "Approval artifact is invalid, mismatched or replayed.",
        approvalAudit.state === "pass"
          ? null
          : "Supply a fresh approved artifact bound to this governed plan.",
        approvalAudit.evidence,
      ),
      check(
        "AUD-004",
        runtimeAudit.state,
        plan.planId,
        runtimeAudit.state === "pass"
          ? "Runtime report is consistent with its execution mode and gates."
          : runtimeAudit.state === "unkown"
            ? "No runtime report was supplied."
            : "Runtime report violates execution, policy or step invariants.",
        runtimeAudit.state === "pass"
          ? null
          : "Audit runtime state, policy effect, approval and step outcomes.",
        runtimeAudit.evidence,
      ),
      check(
        "AUD-005",
        evidenceAudit.state,
        plan.planId,
        evidenceAudit.state === "pass"
          ? "Evidence records are active and valid."
          : evidenceAudit.state === "unknown"
            ? "No evidence records were supplied."
            : "Evidence records are inactive, malformed or fail integrity verification.",
        evidenceAudit.state === "pass"
          ? null
          : "Attach active verifiable evidence before promotion.",
        evidenceAudit.evidence,
      ),
    ];

    const after = {
      tenantId,
      decision,
      plan,
      policyDecision,
      approval,
      runtimeReport,
      evidence,
    };
    if (!same(before, after)) {
      throw new Error("audit input was mutated");
    }

    const generatedAt = this.clock();
    return {
      auditId: `audit.${generatedAt.replace(/[-:.TZ]/g, "").toLowerCase()}`,
      generatedAt,
      requestedBy,
      scope,
      tenantId,
      subject: {
        decisionId: decision.decisionId,
        planYd: plan.planId,
        proposalId: plan.proposalId ?? decision.selectedProposalId ?? null,
        policyDecisionId: policyDecision?.policyDecisionId ?? null,
        runtimeReportId: runtimeReport?.reportId ?? null,
      },
      mode: "advisory",
      mutationAllowed: false,
      executionAllowed: false,
      status: statusFor(checks),
      checks: clone(checks),
      summary: {
        total: checks.length,
        pass: checks.filter((item) => item.state === "pass").length,
        warn: checks.filter((item) => item.state === "warn").length,
        fail: checks.filter((item) => item.state === "fail").length,
        unknown: checks.filter((item) => item.state === "unknown").length,
      },
      evidence: evidenceIds(evidence),
      constraints: {
        automaticApprovalAllowed: false,
        automaticExecutionAllowed: false,
        humanAuthorityRequired: true,
        traceabilityRequired: true,
      },
    };
  }
}

export function createAuditEngine(options = {}) {
  return new AuditEngine(options);
}

export const auditRules = Object.freeze({
  AUD001: "lifecycle traceability",
  AUD002: "decision governance invariants",
  AUD003: "approval binding and freshness",
  AUD004: "runtime and policy consistency",
  AUD005: "evidence activity and integrity",
});

export const auditStatuses = Object.freeze([
  "compliant",
  "attention",
  "non-compliant",
  "insufficient-evidence",
]);
