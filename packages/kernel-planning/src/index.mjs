const PRIORITIES = Object.freeze(["critical", "high", "medium", "low", "info"]);
const PRIORITY_INDEX = new Map(PRIORITIES.map((value, index) => [value, index]));

function clone(value) { return value == null ? value : structuredClone(value); }
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}
function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}
function string(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be a non-empty string`);
}
function priority(value) { return PRIORITY_INDEX.has(value) ? value : "info"; }
function safe(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}
function evidenceFor(finding, reflection) {
  const direct = Array.isArray(finding.evidence) ? finding.evidence : [];
  const shared = Array.isArray(reflection.evidence) ? reflection.evidence.filter((item) => {
    if (!item || typeof item !== "object") return true;
    return !item.subject || item.subject === finding.subject;
  }) : [];
  return [...direct, ...shared].filter(Boolean);
}
function usableEvidence(item) {
  if (typeof item === "string") return item.trim() !== "";
  return Boolean(item && typeof item === "object" && item.status !== "expired");
}
function group(findings) {
  const groups = new Map();
  findings.forEach((finding, index) => {
    object(finding, `reflection.findings[${index}]`);
    string(finding.subject, `reflection.findings[${index}].subject`);
    const category = typeof finding.category === "string" && finding.category.trim() ? finding.category.trim().toLowerCase() : "general";
    const key = `${finding.subject}\0${category}`;
    if (!groups.has(key)) groups.set(key, { subject: finding.subject, category, findings: [] });
    groups.get(key).findings.push(clone(finding));
  });
  return [...groups.values()].sort((a,b)=>a.subject.localeCompare(b.subject)||a.category.localeCompare(b.category));
}
function derivePriority(grouped) {
  return grouped.findings.map((f)=>priority(f.severity)).sort((a,b)=>PRIORITY_INDEX.get(a)-PRIORITY_INDEX.get(b))[0] ?? "info";
}

export class PlanningEngine {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") throw new TypeError("clock must be a function");
    this.clock = clock;
  }

  plan({ tenantId, cycleId, reflectionReport } = {}, {
    requestedBy = "system",
    scope = "platform",
    objective = "governed-evolution",
    maxProposals = 20,
    impactAnalysis = null,
  } = {}) {
    string(tenantId, "tenantId");
    string(cycleId, "cycleId");
    string(requestedBy, "requestedBy");
    string(scope, "scope");
    string(objective, "objective");
    object(reflectionReport, "reflectionReport");
    if (reflectionReport.tenantId !== tenantId) throw new Error("cross-tenant planning blocked");
    if (reflectionReport.cycleId !== cycleId) throw new Error("planning cycle mismatch");
    if (reflectionReport.mode !== "advisory" && reflectionReport.mode !== "read-only") {
      throw new Error("reflectionReport must be advisory or read-only");
    }
    if (!Number.isInteger(maxProposals) || maxProposals < 1) throw new TypeError("maxProposals must be a positive integer");
    const findings = reflectionReport.findings ?? reflectionReport.conclusions;
    if (!Array.isArray(findings)) throw new TypeError("reflectionReport.findings must be an array");

    const sourceReflectionId = reflectionReport.reflectionId ?? reflectionReport.reasoningId ?? reflectionReport.id;
    string(sourceReflectionId, "reflectionReport.reflectionId");

    const proposals = group(findings).map((item, index) => {
      const p = derivePriority(item);
      const evidence = item.findings.flatMap((finding)=>evidenceFor(finding, reflectionReport));
      const evidenceUsable = evidence.some(usableEvidence);
      const impactComplete = Boolean(
        impactAnalysis &&
        (impactAnalysis.complete === true && !impactAnalysis.subject ||
         impactAnalysis.subject === item.subject && impactAnalysis.complete !== false ||
         Array.isArray(impactAnalysis.items) && impactAnalysis.items.some((x)=>x?.subject===item.subject && x.complete!==false))
      );
      const highRisk = p === "critical" || p === "high";
      const constitutionalConflict = item.findings.some((f)=>f.constitutionalConflict === true);
      const requiredEvidence = [];
      if (!evidenceUsable) requiredEvidence.push(`evidence:${item.subject}`);
      if (highRisk && !impactComplete) requiredEvidence.push(`impact-analysis:${item.subject}`);
      const requiredReviews = new Set(["human-owner"]);
      if (highRisk) requiredReviews.add("kernel-governance");
      if (item.findings.some((f)=>f.securityRelevant === true || f.tags?.includes?.("security"))) requiredReviews.add("security");
      const decisionState = constitutionalConflict ? "blocked" : requiredEvidence.length ? "needs-evidence" : "needs-review";
      const recommendation = item.findings.find((f)=>typeof f.recommendation==="string" && f.recommendation.trim())?.recommendation
        ?? `Correct the governed condition affecting ${item.subject}.`;
      return freeze({
        proposalId: `proposal.${safe(sourceReflectionId)}.${safe(item.subject)}.${safe(item.category)}.${index+1}`,
        sourceReflectionId,
        sourceReferences: [sourceReflectionId, ...item.findings.map((f)=>f.ruleId).filter(Boolean)],
        subject: item.subject,
        category: item.category,
        priority: p,
        rationale: item.findings.map((f)=>f.statement).filter((x)=>typeof x==="string"&&x.trim()).join(" ") || `${item.findings.length} governed finding(s) affect ${item.subject}.`,
        findings: clone(item.findings),
        alternatives: [
          { type:"corrective-action", action:recommendation, ownerRequired:true, expiryRequired:false, riskRecordRequired:highRisk },
          { type:"temporary-acceptance", action:`Temporarily accept the condition affecting ${item.subject}.`, ownerRequired:true, expiryRequired:true, riskRecordRequired:true },
          { type:"retire-or-archive", action:`Retire or archive ${item.subject} when correction is not justified.`, ownerRequired:true, expiryRequired:false, riskRecordRequired:true }
        ],
        recommendation,
        requiredEvidence: [...new Set(requiredEvidence)].sort(),
        requiredReviews: [...requiredReviews].sort(),
        impactAnalysisRequired: highRisk,
        impactAnalysisComplete: impactComplete,
        constitutionalConflict,
        decisionState,
        humanApprovalRequired: true,
        mutationAllowed: false,
        executionAllowed: false
      });
    }).sort((a,b)=>PRIORITY_INDEX.get(a.priority)-PRIORITY_INDEX.get(b.priority)||a.subject.localeCompare(b.subject)).slice(0,maxProposals);

    const generatedAt = this.clock();
    string(generatedAt, "generatedAt");
    return freeze({
      planningId: `planning.${generatedAt.replace(/[-:.TZ]/g,"").toLowerCase()}`,
      generatedAt, requestedBy, scope, objective, tenantId, cycleId, sourceReflectionId,
      mode:"advisory", mutationAllowed:false, approvalAllowed:false, executionAllowed:false,
      summary: {
        proposalCount: proposals.length,
        blockedCount: proposals.filter((p)=>p.decisionState==="blocked").length,
        needsEvidenceCount: proposals.filter((p)=>p.decisionState==="needs-evidence").length,
        nedsReviewCount: proposals.filter(()p => p.decisionState === "needs-review").length
      },
      proposals: clone(proposals),
      constraints: {
        humanApprovalRequired:true,
        automaticMutationAllowed:false,
        automaticApprovalAllowed:false,
        automaticExecutionAllowed:false,
        tenantIsolationRequired:true,
        impactAnalysisRequiredForHighPriority:true,
        sourceOfTruth:"institutional-reflection"
      }
    });
  }
}
export function createPlanningEngine(options={}) { return new PlanningEngine(options); }
export const planningPriorities = PRIORITIES;
