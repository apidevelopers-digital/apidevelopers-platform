export const LIMIT_MODES = Object.freeze(["hard", "soft", "monitor"]);
export const LIMIT_PERIODS = Object.freeze(["hour", "day", "month"]);

export class LimitsDomainError extends Error {
  constructor(code, message, { details = {}, cause } = {}) {
    super(message, { cause });
    this.name = "LimitsDomainError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function required(value, name) {
  const result = String(value ?? "").trim();
  if (!result) throw new LimitsDomainError("invalid_argument", `${name} is required`);
  return result;
}

function nonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new LimitsDomainError("invalid_argument", `${name} must be a non-negative safe integer`);
  }
  return value;
}

function iso(value, name) {
  const result = required(value, name);
  if (Number.isNaN(Date.parse(result))) {
    throw new LimitsDomainError("invalid_argument", `${name} must be an ISO date`);
  }
  return result;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function immutable(value) {
  return deepFreeze(structuredClone(value));
}

function optional(value, name) {
  return value === null || value === undefined ? null : required(value, name);
}

export function createLimitRule({
  id,
  planId,
  metric = "requests",
  allowance,
  period = "month",
  mode = "hard",
  apiId = null,
  operation = null,
  effectiveFrom,
  effectiveTo = null,
  metadata = {},
}) {
  if (!LIMIT_PERIODS.includes(period)) {
    throw new LimitsDomainError("invalid_limit_period", "limit period is not supported", {
      details: { period },
    });
  }
  if (!LIMIT_MODES.includes(mode)) {
    throw new LimitsDomainError("invalid_limit_mode", "limit mode is not supported", {
      details: { mode },
    });
  }
  const from = iso(effectiveFrom, "effectiveFrom");
  const to = effectiveTo === null ? null : iso(effectiveTo, "effectiveTo");
  if (to !== null && Date.parse(from) >= Date.parse(to)) {
    throw new LimitsDomainError("invalid_effective_window", "effectiveFrom must be before effectiveTo");
  }
  return immutable({
    id: required(id, "id"),
    planId: required(planId, "planId"),
    metric: required(metric, "metric"),
    allowance: nonNegativeInteger(allowance, "allowance"),
    period,
    mode,
    apiId: optional(apiId, "apiId"),
    operation: optional(operation, "operation"),
    effectiveFrom: from,
    effectiveTo: to,
    metadata,
  });
}

export function createLimitAssignment({
  id,
  tenantId,
  projectId = null,
  planId,
  startsAt,
  endsAt = null,
  metadata = {},
}) {
  const start = iso(startsAt, "startsAt");
  const end = endsAt === null ? null : iso(endsAt, "endsAt");
  if (end !== null && Date.parse(start) >= Date.parse(end)) {
    throw new LimitsDomainError("invalid_assignment_window", "startsAt must be before endsAt");
  }
  return immutable({
    id: required(id, "id"),
    tenantId: required(tenantId, "tenantId"),
    projectId: optional(projectId, "projectId"),
    planId: required(planId, "planId"),
    startsAt: start,
    endsAt: end,
    metadata,
  });
}

export function isEffective(record, at) {
  const instant = Date.parse(iso(at, "at"));
  const start = Date.parse(record.effectiveFrom ?? record.startsAt);
  const endValue = record.effectiveTo ?? record.endsAt;
  return instant >= start && (endValue === null || instant < Date.parse(endValue));
}

export function createLimitWindow(period, at) {
  if (!LIMIT_PERIODS.includes(period)) {
    throw new LimitsDomainError("invalid_limit_period", "limit period is not supported", {
      details: { period },
    });
  }
  const instant = new Date(iso(at, "at"));
  let from;
  let to;
  if (period === "hour") {
    from = new Date(Date.UTC(
      instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate(), instant.getUTCHours()
    ));
    to = new Date(from.getTime() + 60 * 60 * 1000);
  } else if (period === "day") {
    from = new Date(Date.UTC(
      instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()
    ));
    to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  } else {
    from = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), 1));
    to = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth() + 1, 1));
  }
  return immutable({ from: from.toISOString(), to: to.toISOString(), period });
}

function specificity(rule) {
  if (rule.operation !== null) return 2;
  if (rule.apiId !== null) return 1;
  return 0;
}

export function resolveLimitRule(rules, {
  planId,
  metric = "requests",
  apiId = null,
  operation = null,
  at,
}) {
  const normalizedAt = iso(at, "at");
  const candidates = rules
    .map(createLimitRule)
    .filter((rule) => rule.planId === required(planId, "planId"))
    .filter((rule) => rule.metric === required(metric, "metric"))
    .filter((rule) => Date.parse(normalizedAt) >= Date.parse(rule.effectiveFrom))
    .filter((rule) => rule.effectiveTo === null || Date.parse(normalizedAt) < Date.parse(rule.effectiveTo))
    .filter((rule) => rule.apiId === null || rule.apiId === apiId)
    .filter((rule) => rule.operation === null || rule.operation === operation)
    .sort((a, b) =>
      specificity(b) - specificity(a) ||
      Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom) ||
      a.id.localeCompare(b.id)
    );
  return candidates.length ? immutable(candidates[0]) : null;
}

export function evaluateLimit({
  rule,
  consumed,
  requested = 1,
}) {
  const normalizedRule = createLimitRule(rule);
  const used = nonNegativeInteger(consumed, "consumed");
  const demand = nonNegativeInteger(requested, "requested");
  const remainingBefore = Math.max(normalizedRule.allowance - used, 0);
  const projected = used + demand;
  const exceededBy = Math.max(projected - normalizedRule.allowance, 0);
  const withinLimit = exceededBy === 0;

  let action = "allow";
  let allowed = true;
  if (!withinLimit && normalizedRule.mode === "hard") {
    action = "block";
    allowed = false;
  } else if (!withinLimit && normalizedRule.mode === "soft") {
    action = "allow_overage";
  } else if (!withinLimit && normalizedRule.mode === "monitor") {
    action = "allow_monitor";
  }

  return immutable({
    ruleId: normalizedRule.id,
    planId: normalizedRule.planId,
    metric: normalizedRule.metric,
    mode: normalizedRule.mode,
    allowance: normalizedRule.allowance,
    consumed: used,
    requested: demand,
    projected,
    remainingBefore,
    remainingAfter: Math.max(normalizedRule.allowance - projected, 0),
    exceededBy,
    withinLimit,
    allowed,
    action,
  });
}

export function createMemoryLimitsRepository({
  initialRules = [],
  initialAssignments = [],
} = {}) {
  const rules = new Map();
  const assignments = new Map();

  function putRule(input) {
    const rule = createLimitRule(input);
    rules.set(rule.id, rule);
    return immutable(rule);
  }

  function putAssignment(input) {
    const assignment = createLimitAssignment(input);
    assignments.set(assignment.id, assignment);
    return immutable(assignment);
  }

  initialRules.forEach(putRule);
  initialAssignments.forEach(putAssignment);

  return Object.freeze({
    kind: "memory",
    putRule,
    putAssignment,
    getAssignmentFor({ tenantId, projectId = null, at }) {
      const instant = Date.parse(iso(at, "at"));
      const matches = [...assignments.values()]
        .filter((item) => item.tenantId === required(tenantId, "tenantId"))
        .filter((item) => item.projectId === null || item.projectId === projectId)
        .filter((item) => instant >= Date.parse(item.startsAt))
        .filter((item) => item.endsAt === null || instant < Date.parse(item.endsAt))
        .sort((a, b) =>
          Number(b.projectId !== null) - Number(a.projectId !== null) ||
          Date.parse(b.startsAt) - Date.parse(a.startsAt) ||
          a.id.localeCompare(b.id)
        );
      return matches.length ? immutable(matches[0]) : null;
    },
    listRules({ planId } = {}) {
      return [...rules.values()]
        .filter((rule) => planId === undefined || rule.planId === planId)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(immutable);
    },
  });
}

function assertRepository(repository) {
  for (const method of ["putRule", "putAssignment", "getAssignmentFor", "listRules"]) {
    if (typeof repository?.[method] !== "function") {
      throw new LimitsDomainError("invalid_repository", `repository.${method} must be a function`);
    }
  }
  return repository;
}

export function createLimitsService({
  repository = createMemoryLimitsRepository(),
  usageProvider,
  clock = () => new Date().toISOString(),
} = {}) {
  const limits = assertRepository(repository);
  if (typeof usageProvider !== "function") {
    throw new LimitsDomainError("invalid_argument", "usageProvider must be a function");
  }

  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",
    saveRule: (rule) => limits.putRule(rule),
    assignPlan: (assignment) => limits.putAssignment(assignment),
    evaluate({
      tenantId,
      projectId = null,
      apiId = null,
      operation = null,
      metric = "requests",
      requested = 1,
      at = clock(),
    }) {
      const instant = iso(at, "at");
      const assignment = limits.getAssignmentFor({ tenantId, projectId, at: instant });
      if (!assignment) {
        throw new LimitsDomainError("limit_assignment_not_found", "no active plan assignment found", {
          details: { tenantId, projectId, at: instant },
        });
      }
      const rule = resolveLimitRule(limits.listRules({ planId: assignment.planId }), {
        planId: assignment.planId,
        metric,
        apiId,
        operation,
        at: instant,
      });
      if (!rule) {
        throw new LimitsDomainError("limit_rule_not_found", "no effective limit rule found", {
          details: { planId: assignment.planId, metric, apiId, operation, at: instant },
        });
      }
      const window = createLimitWindow(rule.period, instant);
      const consumed = usageProvider({
        tenantId: required(tenantId, "tenantId"),
        projectId,
        apiId,
        operation,
        metric,
        window,
      });
      return immutable({
        assignment,
        rule,
        window,
        decision: evaluateLimit({ rule, consumed, requested }),
      });
    },
  });
}
