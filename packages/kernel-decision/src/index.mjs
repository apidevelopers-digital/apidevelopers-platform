function clone(value) {
  return value == null ? value : structuredClone(value);
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
}

const PRIORITIES = Object.freeze(["critical", "high", "medium", "low", "info"]);
const PRIORITY_INDEX = new Map(PRIORITIES.map((priority, index) => [priority, index]));
const READINESS_INDEX = new Map([
  ["ready-for-human-decision", 0],
  ["needs-review", 1],
  ["needs-evidence", 2],
  ["blocked", 3],
]);

function normalizePriority(value) {
  return PRIORITY_INDEX.has(value) ? value : "info";
}

function normalizeProvided(items) {
  if (!Array.isArray(items)) return new Set();
  return new Set(
    items
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return null;
        return item.id ?? item.type ?? item.name ?? null;
      })
      .filter(Boolean),
  );
}

function missingRequirements(required, provided) {
  return (Array.isArray(required) ? required : [])
    .filter(Boolean)
    .filter((item) => !provided.has(item))
    .sort();
}

function candidateFor(proposal, evidence, reviews) {
  assertObject(proposal, "proposal");
  assertString(proposal.proposalId, "proposal.proposalId");

  const missingEvidence = missingRequirements(
    proposal.requiredEvidence,
    evidence,
  );
  const missingReviews = missingRequirements(
    proposal.requiredReviews,
    reviews,
  );

  const blocked =
    proposal.decisionState === "blocked" ||
    proposal.constitutionalConflict === true;

  const state = blocked
    ? "blocked"
    : missingEvidence.length > 0
      ? "needs-evidence"
      : missingReviews.length > 0
        ? "needs-review"
        : "ready-for-human-decision";

  const recommendation =
    state === "blocked"
      ? "reject"
      : state === "ready-for-human-decision"
        ? "submit-for-human-approval"
        : "defer";

  return {
    proposalId: proposal.proposalId,
    subject: proposal.subject,
    category: proposal.category ?? "general",
    priority: normalizePriority(proposal.priority),
    state,
    recommendation,
    rationale: proposal.rationale ?? "",
    missingEvidence,
    missingReviews,
    constitutionalConflict: blocked,
    sourceReflectionId: proposal.sourceReflectionId,
    sourceReferences: clone(proposal.sourceReferences ?? []),
    humanApprovalRequired: true,
    approved: false,
    mutationAllowed: false,
    executionAllowed: false,
  };
}

function sortCandidates(left, right) {
  return (
    READINESS_INDEX.get(left.state) - READINESS_INDEX.get(right.state) ||
    PRIORITY_INDEX.get(left.priority) - PRIORITY_INDEX.get(right.priority) ||
    String(left.subject ?? "").localeCompare(String(right.subject ?? "")) ||
    left.proposalId.localeCompare(right.proposalId)
  );
}

export class DecisionEngine {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") throw new Error("clock must be a function");
    this.clock = clock;
  }

  evaluate(
    planningReport,
    {
      requestedBy = "system",
      scope = "platform",
      selectedProposalId,
      evidence = [],
      reviews = [],
    } = {},
  ) {
    assertObject(planningReport, "planningReport");
    assertString(planningReport.planningId, "planningReport.planningId");

    if (!Array.isArray(planningReport.proposals)) {
      throw new Error("planningReport.proposals must be an array");
    }

    const providedEvidence = normalizeProvided(evidence);
    const providedReviews = normalizeProvided(reviews);

    const candidates = planningReport.proposals
      .map((proposal) =>
        candidateFor(proposal, providedEvidence, providedReviews),
      )
      .sort(sortCandidates);

    let selected = null;
    if (selectedProposalId) {
      selected = candidates.find(
        (candidate) => candidate.proposalId === selectedProposalId,
      );
      if (!selected) {
        throw new Error(`unknown proposal: ${selectedProposalId}`);
      }
    } else {
      selected =
        candidates.find((candidate) => candidate.state !== "blocked") ??
        candidates[0] ??
        null;
    }

    const generatedAt = this.clock();
    return {
      decisionId: `decision.${generatedAt.replace(/[-:.TZ]/g, "").toLowerCase()}`,
      generatedAt,
      requestedBy,
      scope,
      sourcePlanningId: planningReport.planningId,
      sourceReflectionId: planningReport.sourceReflectionId ?? null,
      mode: "advisory",
      selectedProposalId: selected?.proposalId ?? null,
      decisionState: selected?.state ?? "no-candidate",
      recommendation: selected?.recommendation ?? "defer",
      rationale:
        selected?.rationale ??
        "No governed proposal is available for human decision.",
      gates: {
        missingEvidence: clone(selected?.missingEvidence ?? []),
        missingReviews: clone(selected?.missingReviews ?? []),
        constitutionalConflict:
          selected?.constitutionalConflict ?? false,
      },
      candidates: clone(candidates),
      humanApprovalRequired: true,
      approved: false,
      mutationAllowed: false,
      executionAllowed: false,
      constraints: {
        automaticDecisionAllowed: false,
        automaticApprovalAllowed: false,
        automaticExecutionAllowed: false,
        traceabilityRequired: true,
        sourceOfTruth: "governed-planning-report",
      },
    };
  }
}

export function createDecisionEngine(options = {}) {
  return new DecisionEngine(options);
}

export const decisionStates = Object.freeze([
  "no-candidate",
  "blocked",
  "needs-evidence",
  "needs-review",
  "ready-for-human-decision",
]);
