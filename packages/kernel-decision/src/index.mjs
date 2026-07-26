import { assertPlanningReportContract, assertDecisionReportContract } from "@apidevelopers/contracts";

const PRIORITY = new Map([
  ["critical", 0],
  ["high", 1],
  ["medium", 2],
  ["low", 3],
  ["info", 4],
]);

const clone = (value) => (value == null ? value : structuredClone(value));

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function usableEvidence(items = []) {
  return new Set(
    items
      .filter(Boolean)
      .filter(
        (item) =>
          typeof item === "string" ||
          (typeof item === "object" && item.status !== "expired"),
      )
      .map((item) => (typeof item === "string" ? item : item.id))
      .filter(Boolean),
  );
}

function approvedReviews(items = []) {
  return new Set(
    items
      .filter(
        (item) =>
          item &&
          typeof item === "object" &&
          item.status === "approved",
      )
      .map((item) => item.role)
      .filter(Boolean),
  );
}

export class DecisionEngine {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") {
      throw new TypeError("clock must be a function");
    }
    this.clock = clock;
  }

  decide(
    { tenantId, cycleId, planningReport } = {},
    { evidence = [], reviews = [], requestedBy = "system" } = {},
  ) {
    assertNonEmptyString(tenantId, "tenantId");
    assertNonEmptyString(cycleId, "cycleId");
    assertNonEmptyString(requestedBy, "requestedBy");
    assertPlanningReportContract(planningReport);

    if (planningReport.tenantId && planningReport.tenantId !== tenantId) {
      throw new Error("cross-tenant decision blocked");
    }
    if (planningReport.cycleId && planningReport.cycleId !== cycleId) {
      throw new Error("cross-cycle decision blocked");
    }

    const before = clone(planningReport);
    const availableEvidence = usableEvidence(evidence);
    const approvedReviewRoles = approvedReviews(reviews);

    const candidates = (planningReport.proposals ?? [])
      .map((proposal) => {
        const missingEvidence = (proposal.requiredEvidence ?? []).filter(
          (item) => !availableEvidence.has(item),
        );
        const missingReviews = (proposal.requiredReviews ?? []).filter(
          (role) => !approvedReviewRoles.has(role),
        );

        let decisionState = "ready-for-human-decision";
        if (
          proposal.constitutionalConflict === true ||
          proposal.decisionState === "blocked"
        ) {
          decisionState = "blocked";
        } else if (missingEvidence.length) {
          decisionState = "needs-evidence";
        } else if (missingReviews.length) {
          decisionState = "needs-review";
        }

        return {
          ...clone(proposal),
          missingEvidence: [...missingEvidence].sort(),
          missingReviews: [...missingReviews].sort(),
          decisionState,
          eligible: decisionState === "ready-for-human-decision",
        };
      })
      .sort(
        (left, right) =>
          (PRIORITY.get(left.priority) ?? 99) -
            (PRIORITY.get(right.priority) ?? 99) ||
          left.proposalId.localeCompare(right.proposalId),
      );

    const selected = candidates.find((candidate) => candidate.eligible) ?? null;
    const generatedAt = this.clock();
    assertNonEmptyString(generatedAt, "generatedAt");

    const report = deepFreeze({
      decisionId: `decision.${generatedAt.replace(/[-:.TZ]/g, "").toLowerCase()}`,
      generatedAt,
      requestedBy,
      tenantId,
      cycleId,
      sourcePlanningId: planningReport.planningId,
      mode: "advisory",
      selectedProposalId: selected?.proposalId ?? null,
      decisionState: selected
        ? "ready-for-human-decision"
        : candidates.some(
              (candidate) => candidate.decisionState === "needs-evidence",
            )
          ? "needs-evidence"
          : candidates.some(
                (candidate) => candidate.decisionState === "needs-review",
              )
            ? "needs-review"
            : "blocked",
      recommendation: selected
        ? `Recommend proposal ${selected.proposalId} for explicit human decision.`
        : "No proposal is ready for explicit human decision.",
      candidates,
      gates: {
        evidenceSatisfied: selected
          ? selected.missingEvidence.length === 0
          : false,
        reviewsSatisfied: selected
          ? selected.missingReviews.length === 0
          : false,
        constitutionalConflictFree: selected
          ? selected.constitutionalConflict !== true
          : false,
      },
      approved: false,
      humanApprovalRequired: true,
      humanDecisionRequired: true,
      mutationAllowed: false,
      executionAllowed: false,
      constraints: {
        automaticDecisionAllowed: false,
        automaticApprovalAllowed: false,
        automaticExecutionAllowed: false,
        tenantIsolationRequired: true,
        traceabilityRequired: true,
      },
    });

    if (JSON.stringify(before) !== JSON.stringify(planningReport)) {
      throw new Error("planningReport input was mutated");
    }

    assertDecisionReportContract(report);
    return report;
  }
}

export function createDecisionEngine(options = {}) {
  return new DecisionEngine(options);
}
