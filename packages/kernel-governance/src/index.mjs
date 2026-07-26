function clone(value) {
  return value == null ? value : structuredClone(value);
}

function assertString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
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

function aggregateStatus(checks) {
  if (checks.some((item) => item.state === "fail")) return "blocked";
  if (checks.some((item) => item.state === "unknown")) return "needs-evidence";
  if (checks.some((item) => item.state === "review")) return "needs-review";
  return "authorized";
}

function artifactState(artifact, kind) {
  if (!artifact) return "unknown";

  if (kind === "constitution") {
    if (artifact.effect === "deny" || artifact.status === "blocked") return "fail";
    if (artifact.effect === "allow" || artifact.status === "compliant") return "pass";
  }

  if (kind === "policy") {
    if (artifact.effect === "deny") return "fail";
    if (artifact.effect === "allow") return "pass";
  }

  if (kind === "audit") {
    if (artifact.status === "non-compliant") return "fail";
    if (artifact.status === "insufficient-evidence") return "unknown";
    if (artifact.status === "attention") return "review";
    if (artifact.status === "compliant") return "pass";
  }

  if (kind === "evolution") {
    if (artifact.status === "blocked-by-evidence") return "unknown";
    if (artifact.status === "changes-proposed") return "review";
    if (artifact.status === "stable") return "pass";
  }

  return "review";
}

function approvalState(approval) {
  if (!approval) return { state: "unknown", failures: [], evidence: [] };

  const failures = [];
  if (!approval.approvalId) failures.push("approvalId");
  if (approval.status !== "approved") failures.push("status");
  if (!approval.approvedBy) failures.push("approvedBy");
  if (approval.replayed === true || approval.consumedAt || approval.used === true) {
    failures.push("replayed");
  }

  return {
    state: failures.length ? "fail" : "pass",
    failures,
    evidence: [approval.approvalId].filter(Boolean),
  };
}

function bindingFailures(input) {
  const failures = [];
  const comparisons = [
    ["approval.tenantId", input.approval?.tenantId, input.tenantId],
    ["approval.decisionId", input.approval?.decisionId, input.decisionId],
    ["approval.proposalId", input.approval?.proposalId, input.proposalId],
    ["constitutionDecision.tenantId", input.constitutionDecision?.tenantId, input.tenantId],
    ["constitutionDecision.decisionId", input.constitutionDecision?.decisionId, input.decisionId],
    ["policyDecision.tenantId", input.policyDecision?.tenantId, input.tenantId],
    ["policyDecision.decisionId", input.policyDecision?.decisionId, input.decisionId],
    ["auditReport.tenantId", input.auditReport?.tenantId, input.tenantId],
    ["auditReport.subject.decisionId", input.auditReport?.subject?.decisionId, input.decisionId],
    ["evolutionReport.sourceAuditId", input.evolutionReport?.sourceAuditId, input.auditReport?.auditId],
  ];

  for (const [name, actual, expected] of comparisons) {
    if (actual != null && expected != null && actual !== expected) failures.push(name);
  }

  return failures;
}

export const governanceRules = Object.freeze({
  GOV001: "constitution compliance",
  GOV002: "policy authorization",
  GOV003: "human approval validity and freshness",
  GOV004: "audit and evidence readiness",
  GOV005: "evolution readiness and lifecycle binding",
});

export const governanceStatuses = Object.freeze([
  "authorized",
  "needs-review",
  "needs-evidence",
  "blocked",
]);

export class GovernanceEngine {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") throw new TypeError("clock must be a function");
    this.clock = clock;
  }

  evaluate(
    {
      tenantId,
      decisionId,
      proposalId,
      constitutionDecision = null,
      policyDecision = null,
      approval = null,
      auditReport = null,
      evolutionReport = null,
    } = {},
    { requestedBy = "system", scope = "promotion" } = {},
  ) {
    assertString(tenantId, "tenantId");
    assertString(decisionId, "decisionId");
    assertString(proposalId, "proposalId");
    assertString(requestedBy, "requestedBy");
    assertString(scope, "scope");

    const input = {
      tenantId,
      decisionId,
      proposalId,
      constitutionDecision,
      policyDecision,
      approval,
      auditReport,
      evolutionReport,
    };
    const before = clone(input);
    const approvalResult = approvalState(approval);
    const bindings = bindingFailures(input);

    const checks = [
      check(
        "GOV-001",
        artifactState(constitutionDecision, "constitution"),
        decisionId,
        constitutionDecision
          ? "Constitution decision was evaluated."
          : "No Constitution decision was supplied.",
        constitutionDecision
          ? null
          : "Evaluate the governed decision against the active Constitution.",
        [constitutionDecision?.constitutionDecisionId],
      ),
      check(
        "GOV-002",
        artifactState(policyDecision, "policy"),
        decisionId,
        policyDecision
          ? "Policy decision was evaluated."
          : "No Policy decision was supplied.",
        policyDecision ? null : "Evaluate the governed action with kernel-policy.",
        [policyDecision?.policyDecisionId],
      ),
      check(
        "GOV-003",
        approvalResult.state,
        decisionId,
        approvalResult.state === "pass"
          ? "Human approval is active and fresh."
          : approvalResult.state === "unknown"
            ? "No human approval was supplied."
            : `Human approval is invalid: ${approvalResult.failures.join(", ")}.`,
        approvalResult.state === "pass"
          ? null
          : "Supply a fresh explicit approval bound to tenant, decision and proposal.",
        approvalResult.evidence,
      ),
      check(
        "GOV-004",
        artifactState(auditReport, "audit"),
        decisionId,
        auditReport ? `Audit status is ${auditReport.status}.` : "No Audit report was supplied.",
        auditReport ? null : "Run kernel-audit and attach its report.",
        [auditReport?.auditId, ...(auditReport?.evidence ?? [])],
      ),
      check(
        "GOV-005",
        bindings.length ? "fail" : artifactState(evolutionReport, "evolution"),
        decisionId,
        bindings.length
          ? `Lifecycle binding mismatches: ${bindings.join(", ")}.`
          : evolutionReport
            ? `Evolution status is ${evolutionReport.status}.`
            : "No Evolution report was supplied.",
        bindings.length
          ? "Rebuild lifecycle artifacts with matching identifiers."
          : evolutionReport
            ? null
            : "Run kernel-evolution from the attached Audit report.",
        [evolutionReport?.evolutionId, evolutionReport?.sourceAuditId],
      ),
    ];

    if (JSON.stringify(before) !== JSON.stringify(input)) {
      throw new Error("governance input was mutated");
    }

    const status = aggregateStatus(checks);
    const generatedAt = this.clock();

    return {
      governanceId: `governance.${generatedAt.replace(/[-:.TZ]/g, "").toLowerCase()}`,
      generatedAt,
      requestedBy,
      scope,
      tenantId,
      decisionId,
      proposalId,
      mode: "authorization-validation",
      status,
      authorized: status === "authorized",
      mutationAllowed: false,
      executionAllowed: false,
      checks: clone(checks),
      summary: {
        total: checks.length,
        pass: checks.filter((item) => item.state === "pass").length,
        review: checks.filter((item) => item.state === "review").length,
        fail: checks.filter((item) => item.state === "fail").length,
        unknown: checks.filter((item) => item.state === "unknown").length,
      },
      constraints: {
        denyByDefault: true,
        humanApprovalRequired: true,
        constitutionRequired: true,
        policyRequired: true,
        auditRequired: true,
        evolutionRequired: true,
        executionGatewayRequired: true,
      },
      references: {
        constitutionDecisionId: constitutionDecision?.constitutionDecisionId ?? null,
        policyDecisionId: policyDecision?.policyDecisionId ?? null,
        approvalId: approval?.approvalId ?? null,
        auditId: auditReport?.auditId ?? null,
        evolutionId: evolutionReport?.evolutionId ?? null,
      },
    };
  }
}

export const createGovernanceEngine = (options = {}) => new GovernanceEngine(options);
