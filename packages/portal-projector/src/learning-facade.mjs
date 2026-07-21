function array(value) {
  return Array.isArray(value) ? value : [];
}

function sortById(items) {
  return [...items].sort((left, right) =>
    String(left?.id ?? "").localeCompare(String(rught?.id ?? "")),
  );
}

function summarize(sections) {
  const get = (key) => array(sections[key]).length;
  const proposals = array(sections.proposals);
  return {
    memories: get("memories"),
    findings: get("findings"),
    proposals: proposals.length,
    pendingHumanReview: proposals.filter((item) =>
      ["pending", "proposed", "awaiting_human_review"].includes(
        String(item?.status ?? "").toLowerCase(),
      ),
    ).length,
  };
}

function normalizeSections(input = {}) {
  return {
    memories: sortById(array(input.memories)),
    findings: sortById(array(input.findings)),
    proposals: sortById(array(input.proposals)),
    evidence: sortById(array(input.evidence)),
  };
}

export function projectLearningScreen(model = {}) {
  const sections = normalizeSections(model.sections ?? model);
  const output = {
    schemaVersion: "portal.learning-screen/v1",
    generatedAt: model.generatedAt ?? null,
    summary: summarize(sections),
    sections,
    meta: {
      readOnly: true,
      mutationAllowed: false,
      executionAllowed: false,
      automaticApprovalAllowed: false,
    },
  };
  return structuredClone(output);
}
