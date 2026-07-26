import { createHash } from "node:crypto";

const RISK_LEVELS = Object.freeze(["R0", "R1", "R2", "R3", "R4", "R5"]);
const RISK_INDEX = new Map(RISK_LEVELS.map((risk, index) => [risk, index]));
const SECRET_KEY =
  /(^|[_-])(password|passwd|secret|token|api[_-]?key|authorization|private[_-]?key|database[_-]?url|bearer)($|[_-])/i;
const SECRET_VALUE =
  /(-----BEGIN [A-Z ]*PRIVATE KEY-----|bearer\s+[a-z0-9._~+/=-]{8,})/i;
const HIGH_CONSEQUENCE_TAGS = new Set([
  "legal",
  "juridical",
  "health",
  "medical",
  "evidence",
  "proof",
]);
const CRITICAL_TAGS = new Set(["secret", "credential", "illegal", "critical"]);

const clone = (value) => (value == null ? value : structuredClone(value));

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function containsSecret(value) {
  if (typeof value === "string") return SECRET_VALUE.test(value);
  if (Array.isArray(value)) return value.some(containsSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) => SECRET_KEY.test(key) || containsSecret(child),
  );
}

function normalizeRisk(value) {
  const risk = String(value ?? "R1").toUpperCase();
  return RISK_INDEX.has(risk) ? risk : "R5";
}

function maxRisk(...values) {
  return values
    .map(normalizeRisk)
    .sort((left, right) => RISK_INDEX.get(right) - RISK_INDEX.get(left))[0];
}

function normalizeAction(action) {
  if (typeof action === "string" && action.trim()) {
    return { name: action.trim(), risk: "R1", tags: [], input: {} };
  }
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return { name: "unknown", risk: "R5", tags: [], input: {} };
  }
  return {
    name: String(action.name ?? action.action ?? "unknown").trim() || "unknown",
    risk: normalizeRisk(action.risk),
    tags: Array.isArray(action.tags)
      ? [...new Set(action.tags.map((tag) => String(tag).toLowerCase()))].sort()
      : [],
    input: clone(action.input ?? {}),
  };
}

function inferRisk(action, context) {
  let risk = maxRisk(action.risk, context?.risk ?? "R0");
  const tags = new Set([
    ...action.tags,
    ...(Array.isArray(context?.tags)
      ? context.tags.map((tag) => String(tag).toLowerCase())
      : []),
  ]);
  if ([...tags].some((tag) => HIGH_CONSEQUENCE_TAGS.has(tag))) {
    risk = maxRisk(risk, "R4");
  }
  if (
    [...tags].some((tag) => CRITICAL_TAGS.has(tag)) ||
    containsSecret(action.input) ||
    containsSecret(context?.payload)
  ) {
    risk = "R5";
  }
  return risk;
}

function validTenantId(tenantId) {
  return (
    typeof tenantId === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(tenantId) &&
    !tenantId.includes("@")
  );
}

function validNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function approvalFailures({
  approval,
  tenantId,
  cycleId,
  action,
  decision,
  plan,
  planHash,
  now,
}) {
  const failures = [];
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) {
    return ["approval-required"];
  }
  if (!validNonEmptyString(approval.approvalId)) {
    failures.push("approval-id-required");
  }
  if (approval.status !== "approved") failures.push("approval-not-approved");
  if (!validNonEmptyString(approval.approvedBy)) {
    failures.push("approval-actor-required");
  }
  if (approval.tenantId !== tenantId) failures.push("approval-tenant-mismatch");
  if (
    cycleId &&
    approval.cycleId != null &&
    approval.cycleId !== cycleId
  ) {
    failures.push("approval-cycle-mismatch");
  }
  if ((approval.action ?? approval.actionName) !== action.name) {
    failures.push("approval-action-mismatch");
  }
  if (approval.decisionId !== decision?.decisionId) {
    failures.push("approval-decision-mismatch");
  }
  if (approval.proposalId !== plan?.proposalId) {
    failures.push("approval-proposal-mismatch");
  }
  if (approval.planHash !== planHash) failures.push("approval-plan-mismatch");
  if (approval.consumedAt || approval.used === true) {
    failures.push("approval-replayed");
  }
  if (approval.expiresAt) {
    const expiresAt = new Date(approval.expiresAt).getTime();
    const evaluatedAt = new Date(now).getTime();
    if (!Number.isFinite(expiresAt) || !Number.isFinite(evaluatedAt)) {
      failures.push("approval-expiry-invalid");
    } else if (expiresAt <= evaluatedAt) {
      failures.push("approval-expired");
    }
  }
  return failures;
}

export function hashExecutionPlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new TypeError("plan must be an object");
  }
  return digest({
    planId: plan.planId ?? null,
    decisionId: plan.decisionId ?? null,
    proposalId: plan.proposalId ?? null,
    tenantId: plan.tenantId ?? null,
    cycleId: plan.cycleId ?? null,
    steps: Array.isArray(plan.steps) ? plan.steps : [],
  });
}

export class PolicyEngine {
  #sequence = 0;

  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") {
      throw new TypeError("clock must be a function");
    }
    this.clock = clock;
  }

  evaluate({
    tenantId,
    cycleId,
    action,
    decision,
    plan,
    dryRun = true,
    approval,
    context = {},
  } = {}) {
    const before = clone({ action, decision, plan, approval, context });
    const evaluatedAt = this.clock();
    const normalizedAction = normalizeAction(action);
    const isDryRun = dryRun !== false;
    const planHash =
      plan && typeof plan === "object" && !Array.isArray(plan)
        ? hashExecutionPlan(plan)
        : null;
    const risk = inferRisk(normalizedAction, context);
    const reasons = [];

    if (!validTenantId(tenantId)) {
      reasons.push("tenant-required-or-not-opaque");
    }
    if (cycleId != null && !validNonEmptyString(cycleId)) {
      reasons.push("cycle-invalid");
    }
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
      reasons.push("decision-required");
    }
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
      reasons.push("plan-required");
    }

    if (decision?.decisionState !== "ready-for-human-decision") {
      reasons.push("decision-not-ready");
    }
    if (decision?.gates?.constitutionalConflictFree !== true) {
      reasons.push("constitutional-conflict-or-unverified");
    }
    if (decision?.approved === true) {
      reasons.push("automatic-decision-approval-blocked");
    }
    if (
      decision &&
      (decision.mutationAllowed !== false ||
        decision.executionAllowed !== false)
    ) {
      reasons.push("decision-governance-invariants-not-satisfied");
    }

    if (decision?.tenantId && decision.tenantId !== tenantId) {
      reasons.push("decision-tenant-mismatch");
    }
    if (plan?.tenantId && plan.tenantId !== tenantId) {
      reasons.push("plan-tenant-mismatch");
    }
    if (cycleId && decision?.cycleId && decision.cycleId !== cycleId) {
      reasons.push("decision-cycle-mismatch");
    }
    if (cycleId && plan?.cycleId && plan.cycleId !== cycleId) {
      reasons.push("plan-cycle-mismatch");
    }
    if (
      decision &&
      plan &&
      (plan.decisionId !== decision.decisionId ||
        plan.proposalId !== decision.selectedProposalId)
    ) {
      reasons.push("decision-plan-mismatch");
    }
    if (
      plan?.steps?.[0]?.action &&
      plan.steps[0].action !== normalizedAction.name
    ) {
      reasons.push("action-plan-mismatch");
    }
    if (context?.approvalReplayed === true) {
      reasons.push("approval-replayed");
    }
    if (risk === "R5") reasons.push("risk-r5-blocked");

    let effect = reasons.length ? "deny" : "allow";
    let approvalChecks = [];

    if (effect === "allow" && !isDryRun) {
      approvalChecks = approvalFailures({
        approval,
        tenantId,
        cycleId,
        action: normalizedAction,
        decision,
        plan,
        planHash,
        now: evaluatedAt,
      });
      if (approvalChecks.length) effect = "review";
    }

    const policyDecisionId = `policy.${evaluatedAt
      .replace(/[-:.TZ]/g, "")
      .toLowerCase()}.${++this.#sequence}`;

    const report = deepFreeze({
      policyDecisionId,
      evaluatedAt,
      tenantId: tenantId ?? null,
      cycleId:
        cycleId ??
        decision?.cycleId ??
        plan?.cycleId ??
        null,
      action: normalizedAction,
      risk,
      dryRun: isDryRun,
      effect,
      reasons: [...new Set([...reasons, ...approvalChecks])].sort(),
      planHash,
      approvalId:
        effect === "allow" && !isDryRun
          ? approval?.approvalId ?? null
          : null,
      approvalRequired: !isDryRun,
      humanReviewRequired: effect === "review" || risk === "R4",
      previewAllowed: effect === "allow" && isDryRun,
      executionAllowed: effect === "allow" && !isDryRun,
      mutationAllowed: effect === "allow" && !isDryRun,
      constraints: {
        denyByDefault: true,
        tenantIsolationRequired: true,
        cycleBindingRequired: true,
        traceabilityRequired: true,
        approvalBoundToPlan: true,
        approvalReplayAllowed: false,
        riskFloorForLegalAndHealth: "R4",
        riskR5Blocked: true,
      },
    });

    if (
      JSON.stringify(before) !==
      JSON.stringify({ action, decision, plan, approval, context })
    ) {
      throw new Error("policy input was mutated");
    }
    return report;
  }
}

export function createPolicyEngine(options = {}) {
  return new PolicyEngine(options);
}

export const policyRiskLevels = RISK_LEVELS;
