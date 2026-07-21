function clone(value) {
  return structuredClone(value);
}

function assertArray(value, name) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array`);
  }
}

function byStableKey(a, b) {
  const left = String(a?.id ?? a?.key ?? a?.createdAt ?? "");
  const right = String(b?.id ?? b?.key ?? b?.createdAt ?? "");
  return left.localeCompare(right);
}

export function buildLearningFacade({
  memories = [],
  reflections = [],
  evolutionProposals = [],
  generatedAt = null,
} = {}) {
  assertArray(memories, "memories");
  assertArray(reflections, "reflections");
  assertArray(evolutionProposals, "evolutionProposals");

  const projection = {
    schemaVersion: "portal.learning-facade/v1",
    generatedAt,
    capabilities: Object.freeze({
      read: true,
      suggest: true,
      approve: false,
      mutate: false,
      execute: false,
    }),
    memory: clone(memories).sort(byStableKey),
    reflection: clone(reflections).sort(byStableKey),
    evolution: clone(evolutionProposals).sort(byStableKey).map((proposal) => ({
      ...proposal,
      approvalStatus: proposal.approvalStatus ?? "pending_human_review",
      executionStatus: "not_executed",
    })),
    gates: Object.freeze({
      humanApprovalRequired: true,
      mutationAllowed: false,
      executionAllowed: false,
      automaticApprovalAllowed: false,
    }),
  };

  return Object.freeze(projection);
}

export function createLearningFacade() {
  return Object.freeze({
    project: buildLearningFacade,
    mutationAllowed: false,
    executionAllowed: false,
    automaticApprovalAllowed: false,
  });
}
