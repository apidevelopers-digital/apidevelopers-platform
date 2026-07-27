import {
  DECISION_EFFECTS,
  MODEL_STATUSES,
  RISK_LEVELS,
  assertHeader,
  bool,
  enumeration,
  finalize,
  header,
  id,
  iso,
  numberInRange,
  positiveInteger,
  string,
  strings,
} from "./global-trust-support.mjs";

function expectedRiskLevel(score) {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "moderate";
  return "low";
}

export function assertRiskAssessmentContract(value, name = "riskAssessment") {
  assertHeader(value, "RiskAssessment", name);
  id(value.assessmentId, `${name}.assessmentId`);
  id(value.subjectId, `${name}.subjectId`);
  id(value.tenantId, `${name}.tenantId`);
  string(value.useCase, `${name}.useCase`);
  numberInRange(value.score, `${name}.score`, 0, 100);
  enumeration(value.level, `${name}.level`, RISK_LEVELS);
  if (value.level !== expectedRiskLevel(value.score)) {
    throw new Error(`${name}.level is inconsistent with score`);
  }
  strings(value.factors, `${name}.factors`);
  iso(value.assessedAt, `${name}.assessedAt`);
  string(value.methodVersion, `${name}.methodVersion`);
  return value;
}

export function createRiskAssessment({
  assessmentId,
  subjectId,
  tenantId,
  useCase,
  score,
  factors = [],
  methodVersion,
  assessedAt = new Date().toISOString(),
} = {}) {
  return finalize({
    ...header("RiskAssessment"),
    assessmentId,
    subjectId,
    tenantId,
    useCase,
    score,
    level: typeof score === "number" ? expectedRiskLevel(score) : undefined,
    factors: strings(factors, "factors"),
    methodVersion,
    assessedAt,
  }, assertRiskAssessmentContract);
}

export function assertModelDescriptorContract(value, name = "modelDescriptor") {
  assertHeader(value, "ModelDescriptor", name);
  id(value.modelId, `${name}.modelId`);
  id(value.tenantId, `${name}.tenantId`);
  string(value.provider, `${name}.provider`);
  string(value.model, `${name}.model`);
  string(value.version, `${name}.version`);
  string(value.purpose, `${name}.purpose`);
  id(value.dataPolicyId, `${name}.dataPolicyId`);
  enumeration(value.status, `${name}.status`, MODEL_STATUSES);
  strings(value.allowedLocales, `${name}.allowedLocales`, { allowEmpty: false });
  if (value.secretMaterialIncluded !== false) throw new Error(`${name}.secretMaterialIncluded must be false`);
  return value;
}

export function createModelDescriptor({
  modelId,
  tenantId,
  provider,
  model,
  version,
  purpose,
  dataPolicyId,
  status = "candidate",
  allowedLocales,
} = {}) {
  return finalize({
    ...header("ModelDescriptor"),
    modelId,
    tenantId,
    provider,
    model,
    version,
    purpose,
    dataPolicyId,
    status,
    allowedLocales: strings(allowedLocales ?? [], "allowedLocales", { allowEmpty: false }),
    secretMaterialIncluded: false,
  }, assertModelDescriptorContract);
}

export function assertToolInvocationPolicyContract(value, name = "toolInvocationPolicy") {
  assertHeader(value, "ToolInvocationPolicy", name);
  id(value.policyId, `${name}.policyId`);
  id(value.tenantId, `${name}.tenantId`);
  id(value.toolId, `${name}.toolId`);
  strings(value.allowedActions, `${name}.allowedActions`);
  strings(value.deniedActions, `${name}.deniedActions`);
  positiveInteger(value.maxCallsPerRequest, `${name}.maxCallsPerRequest`);
  bool(value.humanApprovalRequired, `${name}.humanApprovalRequired`);
  if (value.administrativeExecutionAllowed !== false) {
    throw new Error(`${name}.administrativeExecutionAllowed must be false`);
  }
  const overlap = value.allowedActions.filter((action) => value.deniedActions.includes(action));
  if (overlap.length) throw new Error(`${name} has actions both allowed and denied`);
  return value;
}

export function createToolInvocationPolicy({
  policyId,
  tenantId,
  toolId,
  allowedActions = [],
  deniedActions = [],
  maxCallsPerRequest = 1,
  humanApprovalRequired = true,
} = {}) {
  return finalize({
    ...header("ToolInvocationPolicy"),
    policyId,
    tenantId,
    toolId,
    allowedActions: strings(allowedActions, "allowedActions"),
    deniedActions: strings(deniedActions, "deniedActions"),
    maxCallsPerRequest,
    humanApprovalRequired,
    administrativeExecutionAllowed: false,
  }, assertToolInvocationPolicyContract);
}

export function assertSafetyDecisionContract(value, name = "safetyDecision") {
  assertHeader(value, "SafetyDecision", name);
  id(value.safetyDecisionId, `${name}.safetyDecisionId`);
  id(value.assessmentId, `${name}.assessmentId`);
  id(value.tenantId, `${name}.tenantId`);
  enumeration(value.outcome, `${name}.outcome`, DECISION_EFFECTS);
  strings(value.controls, `${name}.controls`);
  strings(value.reasonCodes, `${name}.reasonCodes`, { allowEmpty: false });
  bool(value.humanApprovalRequired, `${name}.humanApprovalRequired`);
  iso(value.decidedAt, `${name}.decidedAt`);
  if (value.outcome === "pending_approval" && value.humanApprovalRequired !== true) {
    throw new Error(`${name}.humanApprovalRequired must be true for pending_approval`);
  }
  return value;
}

export function createSafetyDecision({
  safetyDecisionId,
  assessmentId,
  tenantId,
  outcome,
  controls = [],
  reasonCodes,
  humanApprovalRequired = outcome === "pending_approval",
  decidedAt = new Date().toISOString(),
} = {}) {
  return finalize({
    ...header("SafetyDecision"),
    safetyDecisionId,
    assessmentId,
    tenantId,
    outcome,
    controls: strings(controls, "controls"),
    reasonCodes: strings(reasonCodes ?? [], "reasonCodes", { allowEmpty: false }),
    humanApprovalRequired,
    decidedAt,
  }, assertSafetyDecisionContract);
}

