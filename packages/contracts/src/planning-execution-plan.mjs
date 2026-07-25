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

function safeId(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new TypeError("buildSteps must return a non-empty array");
  }

  const ids = new Set();
  return steps.map((step, index) => {
    assertObject(step, `steps[${index}]`);
    assertString(step.stepId, `steps[${index}].stepId`);
    assertString(step.action, `steps[${index}].action`);
    if (ids.has(step.stepId)) throw new Error(`duplicate stepId: ${step.stepId}`);
    ids.add(step.stepId);

    return {
      stepId: step.stepId,
      action: step.action,
      input: clone(step.input ?? {}),
      risk: String(step.risk ?? "R1").toUpperCase(),
      dependsOn: Array.isArray(step.dependsOn)
        ? [...new Set(step.dependsOn.map(String).filter(Boolean))].sort()
        : [],
      evidenceRequired: Array.isArray(step.evidenceRequired)
        ? [...new Set(step.evidenceRequired.map(String).filter(Boolean))].sort()
        : [],
    };
  });
}

export const contractVersions = deepFreeze({
  PlanningReport: "1.0.0",
  Decision: "1.0.0",
  ExecutionPlan: "1.0.0",
});

export class PlanningExecutionPlanAdapter {
  constructor({
    clock = () => new Date().toISOString(),
    buildSteps,
  } = {}) {
    if (typeof clock !== "function") throw new TypeError("clock must be a function");
    if (typeof buildSteps !== "function") {
      throw new TypeError("buildSteps must be a function");
    }
    this.clock = clock;
    this.buildSteps = buildSteps;
  }

  adapt({
    tenantId,
    planningReport,
    decision,
    requestedBy = "system",
  } = {}) {
    assertString(tenantId, "tenantId");
    assertString(requestedBy, "requestedBy");
    assertObject(planningReport, "planningReport");
    assertObject(decision, "decision");
    assertString(planningReport.planningId, "planningReport.planningId");
    assertString(decision.decisionId, "decision.decisionId");
    assertString(decision.sourcePlanningId, "decision.sourcePlanningId");
    assertString(decision.selectedProposalId, "decision.selectedProposalId");

    if (!Array.isArray(planningReport.proposals)) {
      throw new TypeError("planningReport.proposals must be an array");
    }
    if (decision.sourcePlanningId !== planningReport.planningId) {
      throw new Error("decision.sourcePlanningId does not match planningReport.planningId");
    }
    if (decision.decisionState !== "ready-for-human-decision") {
      throw new Error("decision must be ready-for-human-decision");
    }
    if (decision.approved === true) {
      throw new Error("adapter does not accept automatically approved decisions");
    }
    if (decision.mutationAllowed !== false || decision.executionAllowed !== false) {
      throw new Error("decision governance invariants are not satisfied");
    }

    const proposal = planningReport.proposals.find(
      (item) => item?.proposalId === decision.selectedProposalId,
    );
    if (!proposal) {
      throw new Error(`selected proposal not found: ${decision.selectedProposalId}`);
    }
    if (proposal.constitutionalConflict === true || proposal.decisionState === "blocked") {
      throw new Error("selected proposal is constitutionally blocked");
    }

    const before = clone({ planningReport, decision });
    const generatedAt = this.clock();
    assertString(generatedAt, "clock result");

    const steps = normalizeSteps(
      this.buildSteps(
        deepFreeze(clone(proposal)),
        deepFreeze({
          tenantId,
          decisionId: decision.decisionId,
          planningId: planningReport.planningId,
          proposalId: proposal.proposalId,
          objective: planningReport.objective ?? null,
        }),
      ),
    );

    const after = { planningReport, decision };
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error("adapter input was mutated");
    }

    return deepFreeze({
      planId: `plan.${generatedAt.replace(/[-:.TZ]/g, "").toLowerCase()}.${safeId(proposal.proposalId)}`,
      generatedAt,
      requestedBy,
      tenantId,
      decisionId: decision.decisionId,
      proposalId: proposal.proposalId,
      sourcePlanningId: planningReport.planningId,
      sourceReflectionId:
        planningReport.sourceReflectionId ??
        decision.sourceReflectionId ??
        proposal.sourceReflectionId ??
        null,
      objective: planningReport.objective ?? null,
      status: "draft",
      mode: "contract-adapter",
      steps,
      constraints: {
        humanApprovalRequired: true,
        automaticMutationAllowed: false,
        automaticApprovalAllowed: false,
        automaticExecutionAllowed: false,
        mutationAllowed: false,
        executionAllowed: false,
      },
    });
  }
}

export function createPlanningExecutionPlanAdapter(options = {}) {
  return new PlanningExecutionPlanAdapter(options);
}

export function adaptPlanningDecisionToExecutionPlan(input, options = {}) {
  return createPlanningExecutionPlanAdapter(options).adapt(input);
}
