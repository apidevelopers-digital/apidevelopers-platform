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
const CONSTITUTIONAL_TAGS = new Set([
  "constitutional-conflict",
  "organization-specific-kernel-capture",
  "bypass-evidence",
  "autonomous-mutation",
  "weaken-tenant-isolation",
  "secrets-in-source",
  "traceability-removal",
]);

function normalizePriority(value) {
  return PRIORITY_INDEX.has(value) ? value : "info";
}

function escalate(priority) {
  const index = PRIORITY_INDEX.get(normalizePriority(priority));
  return PRIORITIES[Math.max(0, index - 1)];
}

function safeId(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function categoryOf(finding) {
  if (typeof finding.category === "string" && finding.category.trim()) {
    return finding.category.trim().toLowerCase();
  }
  if (typeof finding.ruleId === "string" && finding.ruleId.trim()) {
    return finding.ruleId.split("-")[0].toLowerCase();
  }
  return "general";
}

function sourceIdOf(reflection) {
  return reflection.reflectionId ?? reflection.reasoningId ?? reflection.id;
}

function providedEvidence(finding, reflection) {
  const direct = Array.isArray(finding.evidence) ? finding.evidence : [];
  const shared = Array.isArray(reflection.evidence)
    ? reflection.evidence.filter((item) => {
        if (!item || typeof item !== "object") return true;
        return !item.subject || item.subject === finding.subject;
      })
    : [];
  return [...direct, ...shared];
}

function isEvidenceUsable(item) {
  if (typeof item === "string") return item.trim() !== "";
  return Boolean(item && typeof item === "object" && item.status !== "expired");
}

function hasConstitutionalConflict(finding, context) {
  if (finding.constitutionalConflict === true) return true;
  const tags = Array.isArray(finding.tags) ? finding.tags : [];
  if (tags.some((tag) => CONSTITUTIONAL_TAGS.has(tag))) return true;

  const conflicts = Array.isArray(context?.constitutionalConflicts)
    ? context.constitutionalConflicts
    : [];
  return conflicts.some(
    (conflict) =>
      conflict === finding.subject ||
      conflict?.subject === finding.subject ||
      conflict?.findingId === finding.ruleId,
  );
}

function impactAvailable(subject, impactAnalysis) {
  if (!impactAnalysis) return false;
  if (impactAnalysis.complete === true && !impactAnalysis.subject) return true;
  if (impactAnalysis.subject === subject && impactAnalysis.complete !== false) return true;
  return Array.isArray(impactAnalysis.items)
    ? impactAnalysis.items.some(
        (item) => item?.subject === subject && item.complete !== false,
      )
    : false;
}

function groupFindings(findings) {
  const groups = new Map();

  findings.forEach((finding, index) => {
    assertObject(finding, `reflection.findings[${index}]`);
    assertString(finding.subject, `reflection.findings[${index}].subject`);

    const category = categoryOf(finding);
    const key = `${finding.subject}\u0000${category}`;

    if (!groups.has(key)) {
      groups.set(key, {
        subject: finding.subject,
        category,
        findings: [],
      });
    }
    groups.get(key).findings.push(clone(finding));
  });

  return [...groups.values()].sort(
    (left, right) =>
      left.subject.localeCompare(right.subject) ||
      left.category.localeCompare(right.category),
  );
}

function derivePriority(group, reflection) {
  let priority = group.findings
    .map((finding) => normalizePriority(finding.severity))
    .sort((left, right) => PRIORITY_INDEX.get(left) - PRIORITY_INDEX.get(right))[0] ?? "info";

  const organizations = new Set(
    group.findings.flatMap((finding) =>
      Array.isArray(finding.organizations) ? finding.organizations.filter(Boolean) : [],
    ),
  );
  const evidenceMissing = group.findings.some(
    (finding) => !providedEvidence(finding, reflection).some(isEvidenceUsable),
  );
  const escalationSignal =
    group.findings.length > 1 ||
    organizations.size > 1 ||
    group.findings.some(
      (finding) =>
        finding.affectsKernelInvariant === true ||
        finding.providerReplacementRisk === true,
    ) ||
    evidenceMissing;

  return escalationSignal ? escalate(priority) : priority;
}

function alternativesFor(group) {
  const recommendation =
    group.findings.find(
      (finding) =>
        typeof finding.recommendation === "string" &&
        finding.recommendation.trim() !== "",
    )?.recommendation ??
    `Correct the governed condition affecting ${group.subject}.`;

  return [
    {
      type: "corrective-action",
      action: recommendation,
      ownerRequired: true,
      expiryRequired: false,
      riskRecordRequired: false,
    },
    {
      type: "temporary-acceptance",
      action: `Temporarily accept the condition affecting ${group.subject}.`,
      ownerRequired: true,
      expiryRequired: true,
      riskRecordRequired: true,
    },
    {
      type: "retire-or-archive",
      action: `Retire or archive ${group.subject} when correction is not justified.`,
      ownerRequired: true,
      expiryRequired: false,
      riskRecordRequired: true,
    },
  ];
}

function proposalFor(group, reflection, options, sourceReflectionId, index) {
  const priority = derivePriority(group, reflection);
  const constitutionalConflict = group.findings.some((finding) =>
    hasConstitutionalConflict(finding, options.context),
  );

  const requiredEvidence = new Set();
  const sourceReferences = new Set([sourceReflectionId]);

  for (const finding of group.findings) {
    if (finding.ruleId) sourceReferences.add(finding.ruleId);

    const evidence = providedEvidence(finding, reflection);
    if (!evidence.some(isEvidenceUsable)) {
      requiredEvidence.add(`evidence:${finding.subject}`);
    }
    if (evidence.some((item) => item?.status === "expired")) {
      requiredEvidence.add(`fresh-evidence:${finding.subject}`);
    }

    const explicit = Array.isArray(finding.requiredEvidence)
      ? finding.requiredEvidence
      : [];
    explicit.filter(Boolean).forEach((item) => requiredEvidence.add(item));
  }

  if (
    (priority === "critical" || priority === "high") &&
    !impactAvailable(group.subject, options.impactAnalysis)
  ) {
    requiredEvidence.add(`impact-analysis:${group.subject}`);
  }

  const requiredReviews = new Set();
  if (
    priority === "critical" ||
    priority === "high" ||
    group.findings.some((finding) => finding.affectsKernelInvariant === true)
  ) {
    requiredReviews.add("kernel-governance");
  }
  if (
    group.findings.some(
      (finding) =>
        finding.securityRelevant === true ||
        (Array.isArray(finding.tags) && finding.tags.includes("security")),
    )
  ) {
    requiredReviews.add("security");
  }

  const decisionState = constitutionalConflict
    ? "blocked"
    : requiredEvidence.size > 0
      ? "needs-evidence"
      : requiredReviews.size > 0
        ? "needs-review"
        : "proposed";

  const statements = group.findings
    .map((finding) => finding.statement)
    .filter((statement) => typeof statement === "string" && statement.trim());

  return {
    proposalId: `proposal.${safeId(sourceReflectionId)}.${safeId(group.subject)}.${safeId(group.category)}.${index + 1}`,
    sourceReflectionId,
    sourceReferences: [...sourceReferences],
    subject: group.subject,
    category: group.category,
    priority,
    rationale:
      statements.length > 0
        ? statements.join(" ")
        : `${group.findings.length} governed finding(s) affect ${group.subject}.`,
    findings: clone(group.findings),
    alternatives: alternativesFor(group),
    recommendation: alternativesFor(group)[0].action,
    requiredEvidence: [...requiredEvidence].sort(),
    requiredReviews: [...requiredReviews].sort(),
    constitutionalConflict,
    decisionState,
    humanApprovalRequired: true,
    mutationAllowed: false,
    executionAllowed: false,
  };
}

export class PlanningEngine {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") throw new Error("clock must be a function");
    this.clock = clock;
  }

  plan(
    reflection,
    {
      requestedBy = "system",
      scope = "platform",
      objective = "governed-evolution",
      maxProposals = 20,
      context = {},
      impactAnalysis,
    } = {},
  ) {
    assertObject(reflection, "reflection");
    const sourceReflectionId = sourceIdOf(reflection);
    assertString(sourceReflectionId, "reflection.reflectionId");

    const findings = reflection.findings ?? reflection.conclusions;
    if (!Array.isArray(findings)) {
      throw new Error("reflection.findings must be an array");
    }
    if (!Number.isInteger(maxProposals) || maxProposals < 1) {
      throw new Error("maxProposals must be a positive integer");
    }
    assertObject(context, "context");

    const normalizedOptions = {
      requestedBy,
      scope,
      objective,
      maxProposals,
      context,
      impactAnalysis,
    };

    const proposals = groupFindings(findings)
      .map((group, index) =>
        proposalFor(
          group,
          reflection,
          normalizedOptions,
          sourceReflectionId,
          index,
        ),
      )
      .sort(
        (left, right) =>
          PRIORITY_INDEX.get(left.priority) - PRIORITY_INDEX.get(right.priority) ||
          left.subject.localeCompare(right.subject) ||
          left.category.localeCompare(right.category),
      )
      .slice(0, maxProposals);

    const generatedAt = this.clock();
    return {
      planningId: `planning.${generatedAt.replace(/[-:.TZ]/g, "").toLowerCase()}`,
      generatedAt,
      requestedBy,
      scope,
      objective,
      sourceReflectionId,
      mode: "advisory",
      mutationAllowed: false,
      approvalAllowed: false,
      executionAllowed: false,
      summary: {
        proposalCount: proposals.length,
        blockedCount: proposals.filter((item) => item.decisionState === "blocked").length,
        needsEvidenceCount: proposals.filter(
          (item) => item.decisionState === "needs-evidence",
        ).length,
        needsReviewCount: proposals.filter(
          (item) => item.decisionState === "needs-review",
        ).length,
      },
      proposals: clone(proposals),
      constraints: {
        humanApprovalRequired: true,
        automaticMutationAllowed: false,
        automaticApprovalAllowed: false,
        automaticExecutionAllowed: false,
        sourceOfTruth: "institutional-reflection",
      },
    };
  }

  deliberate(reflection, options = {}) {
    return this.plan(reflection, options);
  }
}

export function createPlanningEngine(options = {}) {
  return new PlanningEngine(options);
}

export const planningPriorities = PRIORITIES;
