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
    evidence: [...new Set(evidence.filter(Boolean).map(String))].sort(),
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

function collectTraceabilityMismatches({
  tenantId,
  cycleId,
  decision,
  plan,
  policyDecision,
  approval,
  runtimeReport,
  evidence,
}) {
  const mismatches = [];

  if (plan.decisionId !== decision.decisionId) mismatches.push("plan.decisionId");
  if (plan.proposalId !== decision.selectedProposalId) mismatches.push("plan.proposalId");

  if (policyDecision) {
    if (policyDecision.planHash !== plan.planHash) mismatches.push("policyDecision.planHash");
    if (policyDecision.tenantId && policyDecision.tenantId !== tenantId) {
      mismatches.push("policyDecision.tenantId");
    }
    if (policyDecision.cycleId && policyDecision.cycleId !== cycleId) {
      mismatches.push("policyDecision.cycleId");
    }
  }

  if (approval) {
    if (approval.tenantId !== tenantId) mismatches.push("approval.tenantId");
    if (approval.cycleId && approval.cycleId !== cycleId) mismatches.push("approval.cycleId");
    if (approval.decisionId !== decision.decisionId) mismatches.push("approval.decisionId");
    if (approval.proposalId !== plan.proposalId) mismatches.push("approval.proposalId");
    if (approval.planHash !== plan.planHash) mismatches.push("approval.planHash");
  }

  if (runtimeReport) {
    if (runtimeReport.tenantId !== tenantId) mismatches.push("runtimeReport.tenantId");
    if (runtimeReport.cycleId !== cycleId) mismatches.push("runtimeReport.cycleId");
    if (runtimeReport.decisionId !== decision.decisionId) mismatches.push("runtimeReport.decisionId");
    if (runtimeReport.planId !== plan.planId) mismatches.push("runtimeReport.planId");
    if (runtimeReport.proposalId !== plan.proposalId) mismatches.push("runtimeReport.proposalId");
    if (
      policyDecision?.policyDecisionId &&
      runtimeReport.policyDecisionId !== policyDecision.policyDecisionId
    ) {
      mismatches.push("runtimeReport.policyDecisionId");
    }
  }

  for (const record of evidence) {
    if (record?.tenantId !== tenantId) mismatches.push(`evidence.${record?.evidenceId ?? "unknown"}.tenantId`);
    if (record?.cycleId !== cycleId) mismatches.push(`evidence.${record?.evidenceId ?? "unknown"}.cycleId`);
  }

  return [...new Set(mismatches)].sort();
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

function auditApproval({
  approval,
  requestedMode,
  tenantId,
  cycleId,
  decision,
  plan,
  runtimeReport,
}) {
  if (requestedMode === "preview") {
    return approval == null
      ? { state: "pass", evidence: [] }
      : { state: "fail", evidence: [approval.approvalId].filter(Boolean) };
  }

  if (!approval) return { state: "unknown", evidence: [] };

  const valid =
    approval.status === "approved" &&
    typeof approval.approvedBy === "string" &&
    approval.approvedBy.length > 0 &&
    approval.tenantId === tenantId &&
    (!approval.cycleId || approval.cycleId === cycleId) &&
    approval.decisionId === decision.decisionId &&
    approval.proposalId === plan.proposalId &&
    approval.planHash === plan.planHash &&
    approval.consumedAt == null &&
    approval.used !== true &&
    runtimeReport?.approvalId === approval.approvalId;

  return {
    state: valid ? "pass" : "fail",
    evidence: [approval.approvalId].filter(Boolean),
  };
}

function auditRuntime({ runtimeReport, policyDecision, approval }) {
  if (!runtimeReport) return { state: "unknown", evidence: [] };

  const steps = Array.isArray(runtimeReport.steps) ? runtimeReport.steps : [];
  const requestedMode = runtimeReport.requestedMode;

  if (requestedMode === "preview") {
    const valid =
      runtimeReport.state === "previewed" &&
      runtimeReport.dryRun === true &&
      runtimeReport.executionAuthorized === false &&
      runtimeReport.executionObserved === false &&
      runtimeReport.mutationObserved === false &&
      runtimeReport.approvalId == null &&
      steps.length > 0 &&
      steps.every((step) => step.status === "previewed");

    return {
      state: valid ? "pass" : "fail",
      evidence: [runtimeReport.reportId].filter(Boolean),
    };
  }

  if (requestedMode !== "execute") {
    return {
      state: "fail",
      evidence: [runtimeReport.reportId].filter(Boolean),
    };
  }

  const valid =
    runtimeReport.state === "executed" &&
    runtimeReport.dryRun === false &&
    runtimeReport.executionAuthorized === true &&
    runtimeReport.executionObserved === true &&
    runtimeReport.mutationObserved === true &&
    policyDecision?.effect === "allow" &&
    policyDecision?.executionAllowed === true &&
    policyDecision?.mutationAllowed === true &&
    approval?.status === "approved" &&
    steps.length > 0 &&
    steps.every((step) => step.status === "executed");

  return {
    state: valid ? "pass" : "fail",
    evidence: [
      runtimeReport.reportId,
      policyDecision?.policyDecisionId,
      approval?.approvalId,
    ].filter(Boolean),
  };
}

function auditEvidence(records, verifyEvidence, tenantId, cycleId) {
  if (!Array.isArray(records) || records.length === 0) {
    return { state: "unknown", evidence: [] };
  }

  const valid = records.every((record) => {
    if (!record || typeof record !== "object") return false;
    if (!record.evidenceId || record.status !== "active") return false;
    if (record.tenantId !== tenantId || record.cycleId !== cycleId) return false;
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
      cycleId,
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
    assertString(cycleId, "cycleId");
    assertObject(decision, "decision");
    assertObject(plan, "plan");
    assertString(decision.decisionId, "decision.decisionId");
    assertString(plan.planId, "plan.planId");
    assertString(plan.planHash, "plan.planHash");

    if (policyDecision != null) assertObject(policyDecision, "policyDecision");
    if (approval != null) assertObject(approval, "approval");
    if (runtimeReport != null) assertObject(runtimeReport, "runtimeReport");
    if (!Array.isArray(evidence)) throw new TypeError("evidence must be an array");

    const before = clone({
      tenantId,
      cycleId,
      decision,
      plan,
      policyDecision,
      approval,
      runtimeReport,
      evidence,
    });

    const traceabilityMismatches = collectTraceabilityMismatches({
      tenantId,
      cycleId,
      decision,
      plan,
      policyDecision,
      approval,
      runtimeReport,
      evidence,
    });
    const decisionSafe = auditDecision(decision);
    const requestedMode = runtimeReport?.requestedMode ?? "preview";
    const approvalAudit = auditApproval({
      approval,
      requestedMode,
      tenantId,
      cycleId,
      decision,
      plan,
      runtimeReport,
    });
    const runtimeAudit = auditRuntime({ runtimeReport, policyDecision, approval });
    const evidenceAudit = auditEvidence(
      evidence,
      this.verifyEvidence,
      tenantId,
      cycleId,
    );

    const checks = [
      check(
        "AUD-001",
        traceabilityMismatches.length ? "fail" : "pass",
        decision.decisionId,
        traceabilityMismatches.length
          ? `Traceability mismatches: ${traceabilityMismatches.join(", ")}.`
          : "Decision, plan, policy, runtime and evidence references are traceable.",
        traceabilityMismatches.length
          ? "Align lifecycle identifiers before promotion."
          : null,
        [
          decision.decisionId,
          plan.planId,
          policyDecision?.policyDecisionId,
          runtimeReport?.reportId,
          ...evidenceIds(evidence),
        ],
      ),
      check(
        "AUD-002",
        decisionSafe ? "pass" : "fail",
        decision.decisionId,
        decisionSafe
          ? "Decision preserves human authority and blocks automatic approval and execution."
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
          ? requestedMode === "preview"
            ? "Preview correctly carries no approval artifact."
            : "Approval is fresh and bound to tenant, cycle, decision, proposal and plan."
          : approvalAudit.state === "unknown"
            ? "No approval artifact was supplied for execution."
            : "Approval is invalid, mismatched or replayed.",
        approvalAudit.state === "pass"
          ? null
          : "Supply one fresh human approval bound to this exact governed plan.",
        approvalAudit.evidence,
      ),
      check(
        "AUD-004",
        runtimeAudit.state,
        plan.planId,
        runtimeAudit.state === "pass"
          ? "Runtime report is consistent with requested mode, policy and observed step outcomes."
          : runtimeAudit.state === "unknown"
            ? "No runtime report was supplied."
            : "Runtime report violates mode, policy, approval or step invariants.",
        runtimeAudit.state === "pass"
          ? null
          : "Audit runtime mode, policy effect, approval and observed outcomes.",
        runtimeAudit.evidence,
      ),
      check(
        "AUD-005",
        evidenceAudit.state,
        plan.planId,
        evidenceAudit.state === "pass"
          ? "Evidence records are active, tenant-bound, cycle-bound and verifiable."
          : evidenceAudit.state === "unknown"
            ? "No evidence records were supplied."
            : "Evidence is inactive, cross-context, malformed or fails integrity verification.",
        evidenceAudit.state === "pass"
          ? null
          : "Attach active evidence from the same tenant and cycle with valid integrity.",
        evidenceAudit.evidence,
      ),
    ];

    const after = {
      tenantId,
      cycleId,
      decision,
      plan,
      policyDecision,
      approval,
      runtimeReport,
      evidence,
    };
    if (!same(before, after)) throw new Error("audit input was mutated");

    const generatedAt = this.clock();
    assertString(generatedAt, "clock result");

    return deepFreeze({
      auditId: `audit.${generatedAt.replace(/[-:.TZ]/g, "").toLowerCase()}`,
      generatedAt,
      requestedBy,
      scope,
      tenantId,
      cycleId,
      subject: {
        decisionId: decision.decisionId,
        planId: plan.planId,
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
        evidenceIntegrityRequired: true,
        tenantIsolationRequired: true,
        crossTenantAccessAllowed: false,
      },
    });
  }
}

export function createAuditEngine(options = {}) {
  return new AuditEngine(options);
}

export const auditRules = Object.freeze({
  AUD001: "lifecycle traceability",
  AUD002: "decision governance invariants",
  AUD003: "approval binding freshness and replay protection",
  AUD004: "runtime mode policy and observed outcome consistency",
  AUD005: "evidence activity context and integrity",
});

export const auditStatuses = Object.freeze([
  "compliant",
  "attention",
  "non-compliant",
  "insufficient-evidence",
]);
