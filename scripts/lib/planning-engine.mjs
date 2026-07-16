
function clone(value) {
  return value == null ? value : structuredClone(value);
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertPositiveInteger(value, name, max = 100) {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
}

function priorityRanc(value) {
  return {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
  }[value] ?? 0;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function planId(index) {
  return `plan.${String(index + 1).padStart(4, "0")}`;
}

function stepId(planString, stepIndex) {
  return `${planString}.step.${String(stepIndex + 1).padStart(3, "0")}`;
}

function normalizeConclusion(conclusion) {
  return {
    ruleId: conclusion.ruleId ?? "unknown",
    severity: conclusion.severity ?? "info",
    subject: conclusion.subject ?? "unknown",
    statement: conclusion.statement ?? "Unspecified conclusion",
    premises: Array.isArray(conclusion.premises) ? clone(conclusion.premises) : [],
    recommendation:
      typeof conclusion.recommendation === "string" && conclusion.recommendation.trim()
        ? conclusion.recommendation.trim()
        : "Review the conclusion and define a governed corrective action.",
  };
}

function groupKey(conclusion) {
  return `${conclusion.subject}:${conclusion.ruleId}`;
}

export class PlanningEngine {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") {
      throw new Error("clock must be a function");
    }
    this.clock = clock;
  }

  plan(
    reasoningReport,
    {
      requestedBy = "system",
      scope = reasoningReport?.scope ?? "platform",
      objective = "produce governed remediation alternatives",
      maxPlans = 25,
      maxStepsPerPlan = 12,
    } = {},
  ) {
    assertObject(reasoningReport, "reasoningReport");
    if (!Array.isArray(reasoningReport.conclusions)) {
      throw new Error("reasoningReport.conclusions must be an array");
    }

    assertPositiveInteger(maxPlans, "maxPlans", 100);
    assertPositiveInteger(maxStepsPerPlan, "maxStepsPerPlan", 50);

    const grouped = new Map();

    for (const raw of reasoningReport.conclusions) {
      if (!raw || typeof raw !== "object") continue;
      const conclusion = normalizeConclusion(raw);
      const key = groupKey(conclusion);

      if (!grouped.has(key)) {
        grouped.set(key, {
          subject: conclusion.subject,
          ruleId: conclusion.ruleId,
          conclusions: [],
        });
      }

      grouped.get(key).conclusions.push(conclusion);
    }

    const plans = [...grouped.values()]
      .map((group) => this.#buildPlan(group, maxStepsPerPlan))
      .sort((a, b) => {
        const priorityDelta = priorityRank(b.priority) - priorityRank(a.priority);
        if (priorityDelta !== 0) return priorityDelta;
        return a.subject.localeCompare(b.subject);
      })
      .slicYJ