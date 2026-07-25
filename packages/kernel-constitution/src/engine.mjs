import { RISK_LEVELS, clone, deepFreeze, assertString, normalizeAction, normalizeConstitution, ruleMatches, unmetRequirements, effectPrecedence } from "./core.mjs";

export const constitutionEffects = Object.freeze(["allow", "review", "deny"]);
export const constitutionRiskLevels = RISK_LEVELS;

export class ConstitutionEngine {
  #sequence = 0;

  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") {
      throw new TypeError("clock must be a function");
    }
    this.clock = clock;
  }

  evaluate({
    tenantId,
    decisionId,
    proposalId,
    action,
    constitution,
    context = {},
  } = {}, {
    requestedBy = "system",
    scope = "governance",
  } = {}) {
    assertString(tenantId, "tenantId");
    assertString(decisionId, "decisionId");
    assertString(proposalId, "proposalId");
    assertString(requestedBy, "requestedBy");
    assertString(scope, "scope");

    const before = clone({ action, constitution, context });
    const normalizedAction = normalizeAction(action, context);
    const document = normalizeConstitution(constitution);
    const evaluatedAt = this.clock();
    const reasons = [];
    const matchedRuleIds = [];
    const requirementFailures = [];
    const effects = [];

    if (document.status !== "active") {
      effects.push("deny");
      reasons.push("constitution-not-active");
    }

    if (
      document.tenantScope.length === 0 ||
      (!document.tenantScope.includes("*") && !document.tenantScope.includes(tenantId))
    ) {
      effects.push("deny");
      reasons.push("tenant-out-of-scope");
    }

    const matchingRules = document.rules
      .filter((rule) => ruleMatches(rule, normalizedAction))
      .sort((left, right) => left.ruleId.localeCompare(right.ruleId));

    for (const rule of matchingRules) {
      matchedRuleIds.push(rule.ruleId);
      const unmet = unmetRequirements(rule.requirements, normalizedAction);

      if (rule.effect === "deny") {
        effects.push("deny");
        reasons.push(`rule-deny:${rule.ruleId}`);
        continue;
      }

      if (rule.effect === "review") {
        effects.push("review");
        reasons.push(`rule-review:${rule.ruleId}`);
      } else if (rule.effect === "allow") {
        effects.push("allow");
      } else if (rule.effect === "require") {
        if (unmet.length) {
          effects.push("review");
          reasons.push(`requirements-unmet:${rule.ruleId}`);
          requirementFailures.push({
            ruleId: rule.ruleId,
            requirements: unmet,
          });
        } else {
          effects.push("allow");
        }
      }
    }

    if (matchingRules.length === 0) {
      effects.push(document.defaultEffect);
      reasons.push(`default-effect:${document.defaultEffect}`);
    }

    const effect = effectPrecedence(effects);
    const after = { action, constitution, context };
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error("constitution input was mutated");
    }

    const constitutionDecisionId = `constitution.${evaluatedAt
      .replace(/[-:.TZ]/g, "")
      .toLowerCase()}.${++this.#sequence}`;

    return deepFreeze({
      constitutionDecisionId,
      evaluatedAt,
      requestedBy,
      scope,
      tenantId,
      decisionId,
      proposalId,
      constitutionId: document.constitutionId,
      constitutionVersion: document.version,
      mode: "constitutional-validation",
      effect,
      reasons: [...new Set(reasons)].sort(),
      matchedRuleIds,
      requirementFailures: clone(requirementFailures),
      action: clone(normalizedAction),
      mutationAllowed: false,
      executionAllowed: false,
      humanReviewRequired: effect !== "allow",
      constraints: {
        denyByDefault: document.defaultEffect === "deny",
        constitutionRequired: true,
        activeVersionRequired: true,
        tenantScopeRequired: true,
        policyEvaluationStillRequired: true,
        governanceAuthorizationStillRequired: true,
        executionGatewayRequired: true,
      },
    });
  }
}

export function createConstitutionEngine(options = {}) {
  return new ConstitutionEngine(options);
}
