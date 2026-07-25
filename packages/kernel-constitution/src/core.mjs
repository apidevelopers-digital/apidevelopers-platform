const RISK_LEVELS = Object.freeze(["R0", "R1", "R2", "R3", "R4", "R5"]);
const RISK_INDEX = new Map(RISK_LEVELS.map((risk, index) => [risk, index]));
const EFFECTS = new Set(["allow", "review", "deny"]);
const RULE_EFFECTS = new Set(["allow", "review", "deny", "require"]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function normalizeRisk(value) {
  const risk = String(value ?? "R1").toUpperCase();
  return RISK_INDEX.has(risk) ? risk : "R5";
}

function normalizeStrings(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))].sort()
    : [];
}

function normalizeAction(action, context = {}) {
  if (typeof action === "string" && action.trim()) {
    return {
      name: action.trim(),
      domain: String(context.domain ?? "general"),
      risk: normalizeRisk(context.risk),
      tags: normalizeStrings(context.tags),
      authority: normalizeStrings(context.authority),
      evidence: normalizeStrings(context.evidence),
      approvalPresent: context.approvalPresent === true,
      backupPresent: context.backupPresent === true,
      rollbackPresent: context.rollbackPresent === true,
    };
  }

  assertObject(action, "action");
  assertString(action.name ?? action.action, "action.name");

  return {
    name: String(action.name ?? action.action).trim(),
    domain: String(action.domain ?? context.domain ?? "general"),
    risk: normalizeRisk(action.risk ?? context.risk),
    tags: normalizeStrings([...(action.tags ?? []), ...(context.tags ?? [])]),
    authority: normalizeStrings([...(action.authority ?? []), ...(context.authority ?? [])]),
    evidence: normalizeStrings([...(action.evidence ?? []), ...(context.evidence ?? [])]),
    approvalPresent: action.approvalPresent === true || context.approvalPresent === true,
    backupPresent: action.backupPresent === true || context.backupPresent === true,
    rollbackPresent: action.rollbackPresent === true || context.rollbackPresent === true,
  };
}

function normalizeConstitution(constitution) {
  assertObject(constitution, "constitution");
  assertString(constitution.constitutionId, "constitution.constitutionId");
  assertString(constitution.version, "constitution.version");

  const status = constitution.status ?? "draft";
  const defaultEffect = constitution.defaultEffect ?? "deny";
  if (!EFFECTS.has(defaultEffect)) {
    throw new TypeError("constitution.defaultEffect must be allow, review, or deny");
  }

  const tenantScope = normalizeStrings(constitution.tenantScope ?? ["*"]);
  const rules = Array.isArray(constitution.rules) ? constitution.rules : [];

  return {
    constitutionId: constitution.constitutionId,
    version: constitution.version,
    status,
    defaultEffect,
    tenantScope,
    rules: rules.map((rule, index) => {
      assertObject(rule, `constitution.rules[${index}]`);
      assertString(rule.ruleId, `constitution.rules[${index}].ruleId`);
      const effect = rule.effect ?? "review";
      if (!RULE_EFFECTS.has(effect)) {
        throw new TypeError(`constitution.rules[${index}].effect is invalid`);
      }

      return {
        ruleId: rule.ruleId,
        effect,
        statement: String(rule.statement ?? ""),
        match: clone(rule.match ?? {}),
        requirements: clone(rule.requirements ?? {}),
      };
    }),
  };
}

function ruleMatches(rule, action) {
  const match = rule.match ?? {};
  const actions = normalizeStrings(match.actions);
  const domains = normalizeStrings(match.domains);
  const anyTags = normalizeStrings(match.anyTags);
  const allTags = normalizeStrings(match.allTags);
  const minRisk = match.minRisk ? normalizeRisk(match.minRisk) : null;
  const maxRisk = match.maxRisk ? normalizeRisk(match.maxRisk) : null;

  if (actions.length && !actions.includes(action.name)) return false;
  if (domains.length && !domains.includes(action.domain)) return false;
  if (anyTags.length && !anyTags.some((tag) => action.tags.includes(tag))) return false;
  if (allTags.length && !allTags.every((tag) => action.tags.includes(tag))) return false;
  if (minRisk && RISK_INDEX.get(action.risk) < RISK_INDEX.get(minRisk)) return false;
  if (maxRisk && RISK_INDEX.get(action.risk) > RISK_INDEX.get(maxRisk)) return false;
  return true;
}

function unmetRequirements(requirements, action) {
  const unmet = [];
  const authority = normalizeStrings(requirements.authority);

  if (authority.length && !authority.some((item) => action.authority.includes(item))) {
    unmet.push("authority");
  }
  if (requirements.evidence === true && action.evidence.length === 0) unmet.push("evidence");
  if (requirements.approval === true && action.approvalPresent !== true) unmet.push("approval");
  if (requirements.backup === true && action.backupPresent !== true) unmet.push("backup");
  if (requirements.rollback === true && action.rollbackPresent !== true) unmet.push("rollback");

  return unmet;
}

function effectPrecedence(effects) {
  if (effects.includes("deny")) return "deny";
  if (effects.includes("review")) return "review";
  return "allow";
}


export { RISK_LEVELS, clone, deepFreeze, assertString, normalizeAction, normalizeConstitution, ruleMatches, unmetRequirements, effectPrecedence };
