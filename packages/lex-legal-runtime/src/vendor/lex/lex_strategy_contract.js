export const STRATEGY_SCHEMA_VERSION = "strategy_v1";

const TOP_LEVEL_KEYS = new Set([
  "schema_version",
  "summary",
  "issues",
  "applicable_law",
  "hypotheses",
  "risks",
  "contradictions",
  "unknowns",
  "next_actions",
  "countercheck",
  "human_review_required",
  "final_legal_conclusion_allowed",
  "probability_of_success_allowed",
  "execute_actions"
]);

const HYPOTHESIS_STATUS = new Set([
  "PLAUSIBLE",
  "CONTESTED",
  "INSUFFICIENT_EVIDENCE"
]);

const RISK_LEVEL = new Set(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]);
const PRIORITY = new Set(["LOW", "MEDIUM", "HIGH"]);

function bad(message) {
  throw Object.assign(new Error(message), { status: 422 });
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) bad(`${label}_object_required`);
  return value;
}

function clean(value, max = 4000, required = true, label = "text") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (required && !text) bad(`${label}_required`);
  if (text.length > max) bad(`${label}_too_long`);
  return text;
}

function array(value, label, max = 50) {
  if (!Array.isArray(value)) bad(`${label}_array_required`);
  if (value.length > max) bad(`${label}_too_many_items`);
  return value;
}

function cleanFactIds(value, allowed, label) {
  const ids = array(value ?? [], label, 50).map((id) => clean(id, 80, true, label));
  const unique = [...new Set(ids)];
  for (const id of unique) {
    if (!allowed.has(id)) bad(`${label}_unknown_reference`);
  }
  return unique;
}

function cleanEvidenceIds(value, allowed, label) {
  const ids = array(value ?? [], label, 50).map((id) => Number(id));
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) bad(`${label}_invalid_reference`);
  const unique = [...new Set(ids)];
  for (const id of unique) {
    if (!allowed.has(id)) bad(`${label}_unknown_reference`);
  }
  return unique;
}

function requireAnchor(item, label) {
  if (!item.fact_ids.length && !item.evidence_ids.length) bad(`${label}_source_anchor_required`);
}

function allowedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) bad(`${label}_unexpected_field`);
  }
}

function idsFromFacts(facts) {
  return new Set((Array.isArray(facts) ? facts : []).map((f) => String(f?.id ?? "").trim()).filter(Boolean));
}

function idsFromEvidence(evidence) {
  return new Set(
    (Array.isArray(evidence) ? evidence : [])
      .map((e) => Number(e?.id))
      .filter((id) => Number.isInteger(id) && id > 0)
  );
}

function anchorFields(row, factIds, evidenceIds, label, required = true) {
  const fact_ids = cleanFactIds(row.fact_ids ?? [], factIds, `${label}_fact_ids`);
  const evidence_ids = cleanEvidenceIds(row.evidence_ids ?? [], evidenceIds, `${label}_evidence_ids`);
  const anchored = { fact_ids, evidence_ids };
  if (required) requireAnchor(anchored, label);
  return anchored;
}

function normalizeAnchoredList(value, {
  label,
  factIds,
  evidenceIds,
  textKey,
  textMax = 3000,
  max = 30,
  idPrefix,
  extra = () => ({})
}) {
  return array(value, label, max).map((raw, index) => {
    const row = object(raw, `${label}_item`);
    const allowed = new Set([textKey, "fact_ids", "evidence_ids", ...Object.keys(extra(row, true))]);
    allowedKeys(row, allowed, `${label}_item`);
    const anchors = anchorFields(row, factIds, evidenceIds, `${label}_item`);
    return {
      id: `${idPrefix}-${String(index + 1).padStart(3, "0")}`,
      [textKey]: clean(row[textKey], textMax, true, `${label}_${textKey}`),
      ...extra(row, false),
      ...anchors
    };
  });
}

export function normalizeStrategy(value, { facts = [], evidence = [] } = {}) {
  const input = object(value, "strategy");
  allowedKeys(input, TOP_LEVEL_KEYS, "strategy");

  if (input.schema_version && input.schema_version !== STRATEGY_SCHEMA_VERSION) {
    bad("strategy_schema_version_invalid");
  }

  const factIds = idsFromFacts(facts);
  const evidenceIds = idsFromEvidence(evidence);

  const issues = normalizeAnchoredList(input.issues ?? [], {
    label: "issues",
    factIds,
    evidenceIds,
    textKey: "issue",
    idPrefix: "I",
    max: 30
  });

  const applicable_law = normalizeAnchoredList(input.applicable_law ?? [], {
    label: "applicable_law",
    factIds,
    evidenceIds,
    textKey: "rule",
    idPrefix: "L",
    max: 30
  });

  const hypotheses = normalizeAnchoredList(input.hypotheses ?? [], {
    label: "hypotheses",
    factIds,
    evidenceIds,
    textKey: "hypothesis",
    idPrefix: "H",
    max: 30,
    extra(row, probe) {
      if (probe) return { status: true };
      const status = clean(row.status, 40, true, "hypothesis_status").toUpperCase();
      if (!HYPOTHESIS_STATUS.has(status)) bad("hypothesis_status_invalid");
      return { status };
    }
  });

  const risks = normalizeAnchoredList(input.risks ?? [], {
    label: "risks",
    factIds,
    evidenceIds,
    textKey: "risk",
    idPrefix: "R",
    max: 30,
    extra(row, probe) {
      if (probe) return { level: true };
      const level = clean(row.level, 20, true, "risk_level").toUpperCase();
      if (!RISK_LEVEL.has(level)) bad("risk_level_invalid");
      return { level };
    }
  });

  const contradictions = normalizeAnchoredList(input.contradictions ?? [], {
    label: "contradictions",
    factIds,
    evidenceIds,
    textKey: "contradiction",
    idPrefix: "C",
    max: 30
  });

  const unknowns = array(input.unknowns ?? [], "unknowns", 30).map((raw, index) => {
    const row = object(raw, "unknowns_item");
    allowedKeys(row, new Set(["unknown", "fact_ids", "evidence_ids"]), "unknowns_item");
    return {
      id: `U-${String(index + 1).padStart(3, "0")}`,
      unknown: clean(row.unknown, 3000, true, "unknowns_unknown"),
      ...anchorFields(row, factIds, evidenceIds, "unknowns_item", false)
    };
  });

  const next_actions = array(input.next_actions ?? [], "next_actions", 30).map((raw, index) => {
    const row = object(raw, "next_actions_item");
    allowedKeys(
      row,
      new Set(["action", "priority", "reason", "fact_ids", "evidence_ids", "human_decision_required"]),
      "next_actions_item"
    );
    const priority = clean(row.priority ?? "MEDIUM", 20, true, "next_action_priority").toUpperCase();
    if (!PRIORITY.has(priority)) bad("next_action_priority_invalid");
    return {
      id: `A-${String(index + 1).padStart(3, "0")}`,
      action: clean(row.action, 3000, true, "next_action_action"),
      priority,
      reason: clean(row.reason ?? "", 3000, false, "next_action_reason"),
      ...anchorFields(row, factIds, evidenceIds, "next_actions_item", false),
      human_decision_required: true
    };
  });

  const countercheck = normalizeAnchoredList(input.countercheck ?? [], {
    label: "countercheck",
    factIds,
    evidenceIds,
    textKey: "challenge",
    idPrefix: "X",
    max: 30,
    extra(row, probe) {
      if (probe) return { impact: true };
      return { impact: clean(row.impact, 3000, true, "countercheck_impact") };
    }
  });

  return {
    schema_version: STRATEGY_SCHEMA_VERSION,
    summary: clean(input.summary, 5000, true, "strategy_summary"),
    issues,
    applicable_law,
    hypotheses,
    risks,
    contradictions,
    unknowns,
    next_actions,
    countercheck,
    human_review_required: true,
    final_legal_conclusion_allowed: false,
    probability_of_success_allowed: false,
    execute_actions: false
  };
}

export function parseStrategyText(text, context = {}) {
  const raw = clean(text, 50000, true, "strategy_output");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    bad("strategy_output_invalid_json");
  }
  return normalizeStrategy(parsed, context);
}

export const STRATEGY_OUTPUT_TEMPLATE = Object.freeze({
  schema_version: STRATEGY_SCHEMA_VERSION,
  summary: "...",
  issues: [{ issue: "...", fact_ids: ["F-001"], evidence_ids: [1] }],
  applicable_law: [{ rule: "...", fact_ids: [], evidence_ids: [1] }],
  hypotheses: [{
    hypothesis: "...",
    status: "PLAUSIBLE",
    fact_ids: ["F-001"],
    evidence_ids: [1]
  }],
  risks: [{ risk: "...", level: "UNKNOWN", fact_ids: [], evidence_ids: [1] }],
  contradictions: [{ contradiction: "...", fact_ids: ["F-001"], evidence_ids: [1] }],
  unknowns: [{ unknown: "...", fact_ids: [], evidence_ids: [] }],
  next_actions: [{
    action: "...",
    priority: "MEDIUM",
    reason: "...",
    fact_ids: [],
    evidence_ids: [1],
    human_decision_required: true
  }],
  countercheck: [{ challenge: "...", impact: "...", fact_ids: [], evidence_ids: [1] }]
});
