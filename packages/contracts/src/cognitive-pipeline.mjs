import { assertTenantContextContract } from "./tenancy-context.mjs";

const STAGES = Object.freeze([
  "kernel-memory",
  "kernel-reasoning",
  "kernel-reflection",
  "kernel-planning",
  "kernel-decision",
]);

const TRANSITIONS = new Set([
  "kernel-memory->kernel-reasoning",
  "kernel-reasoning->kernel-reflection",
  "kernel-reflection->kernel-planning",
  "kernel-planning->kernel-decision",
]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertArray(value, name) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertBoolean(value, expected, name) {
  if (value !== expected) {
    throw new Error(`${name} must be ${expected}`);
  }
}

function assertImmutableFlags(value, name, flags) {
  for (const flag of flags) {
    assertBoolean(value[flag], false, `${name}.${flag}`);
  }
}

export const cognitivePipelineContractVersion = 1;
export const cognitivePipelineStages = STAGES;

export function assertMemorySnapshotContract(snapshot, name = "memorySnapshot") {
  assertObject(snapshot, name);
  if (snapshot.schemaVersion !== 1) {
    throw new Error(`${name}.schemaVersion must be 1`);
  }
  if (snapshot.mode !== "append-only") {
    throw new Error(`${name}.mode must be append-only`);
  }
  assertImmutableFlags(snapshot, name, ["mutationAllowed"]);
  assertArray(snapshot.entries, `${name}.entries`);

  for (const [index, entry] of snapshot.entries.entries()) {
    assertObject(entry, `${name}.entries[${index}]`);
    for (const field of ["id", "type", "subject", "cycleId"]) {
      assertNonEmptyString(entry[field], `${name}.entries[${index}].${field}`);
    }
    if (entry.schemaVersion !== 1) {
      throw new Error(`${name}.entries[${index}].schemaVersion must be 1`);
    }
  }

  if (snapshot.entryCount !== snapshot.entries.length) {
    throw new Error(`${name}.entryCount must match entries.length`);
  }

  return snapshot;
}

export function assertReasoningReportContract(report, name = "reasoningReport") {
  assertObject(report, name);
  assertNonEmptyString(report.reasoningId, `${name}.reasoningId`);
  if (report.mode !== "read-only") {
    throw new Error(`${name}.mode must be read-only`);
  }
  assertImmutableFlags(report, name, ["mutationAllowed"]);
  assertObject(report.summary, `${name}.summary`);
  assertArray(report.conclusions, `${name}.conclusions`);
  assertObject(report.constraints, `${name}.constraints`);
  assertBoolean(
    report.constraints.automaticDecisionAllowed,
    false,
    `${name}.constraints.automaticDecisionAllowed`,
  );
  assertBoolean(
    report.constraints.automaticExecutionAllowed,
    false,
    `${name}.constraints.automaticExecutionAllowed`,
  );
  return report;
}

export function assertReflectionReportContract(report, name = "reflectionReport") {
  assertObject(report, name);
  assertNonEmptyString(report.reflectionId, `${name}.reflectionId`);
  if (report.mode !== "advisory") {
    throw new Error(`${name}.mode must be advisory`);
  }
  assertImmutableFlags(report, name, ["mutationAllowed"]);
  assertObject(report.summary, `${name}.summary`);
  assertArray(report.findings, `${name}.findings`);
  return report;
}

export function assertPlanningReportContract(report, name = "planningReport") {
  assertObject(report, name);
  assertNonEmptyString(report.planningId, `${name}.planningId`);
  assertNonEmptyString(report.sourceReflectionId, `${name}.sourceReflectionId`);
  if (report.mode !== "advisory") {
    throw new Error(`${name}.mode must be advisory`);
  }
  assertImmutableFlags(report, name, [
    "mutationAllowed",
    "approvalAllowed",
    "executionAllowed",
  ]);
  assertObject(report.summary, `${name}.summary`);
  assertArray(report.proposals, `${name}.proposals`);
  assertObject(report.constraints, `${name}.constraints`);
  for (const field of [
    "automaticMutationAllowed",
    "automaticApprovalAllowed",
    "automaticExecutionAllowed",
  ]) {
    assertBoolean(
      report.constraints[field],
      false,
      `${name}.constraints.${field}`,
    );
  }
  return report;
}

export function assertDecisionReportContract(report, name = "decisionReport") {
  assertObject(report, name);
  assertNonEmptyString(report.decisionId, `${name}.decisionId`);
  assertNonEmptyString(report.sourcePlanningId, `${name}.sourcePlanningId`);
  if (report.mode !== "advisory") {
    throw new Error(`${name}.mode must be advisory`);
  }
  assertNonEmptyString(report.decisionState, `${name}.decisionState`);
  assertNonEmptyString(report.recommendation, `${name}.recommendation`);
  assertArray(report.candidates, `${name}.candidates`);
  assertObject(report.gates, `${name}.gates`);
  assertObject(report.constraints, `${name}.constraints`);
  assertBoolean(report.humanApprovalRequired, true, `${name}.humanApprovalRequired`);
  assertBoolean(report.approved, false, `${name}.approved`);
  assertImmutableFlags(report, name, [
    "mutationAllowed",
    "executionAllowed",
  ]);
  for (const field of [
    "automaticDecisionAllowed",
    "automaticApprovalAllowed",
    "automaticExecutionAllowed",
  ]) {
    assertBoolean(
      report.constraints[field],
      false,
      `${name}.constraints.${field}`,
    );
  }
  assertBoolean(report.constraints.traceabilityRequired, true, `${name}.constraints.traceabilityRequired`);
  return report;
}

function assertTransitionPayload(from, to, payload, name) {
  const transition = `${from}->${to}`;

  if (transition === "kernel-memory->kernel-reasoning") {
    assertMemorySnapshotContract(payload.memorySnapshot, `${name}.memorySnapshot`);
    assertObject(payload.knowledgeSnapshot, `${name}.knowledgeSnapshot`);
    assertArray(payload.knowledgeSnapshot.nodes, `${name}.knowledgeSnapshot.nodes`);
    assertArray(payload.knowledgeSnapshot.relations, `${name}.knowledgeSnapshot.relations`);
    return;
  }

  if (transition === "kernel-reasoning->kernel-reflection") {
    assertReasoningReportContract(payload.reasoningReport, `${name}.reasoningReport`);
    assertObject(payload.knowledgeSnapshot, `${name}.knowledgeSnapshot`);
    assertArray(payload.knowledgeSnapshot.nodes, `${name}.knowledgeSnapshot.nodes`);
    assertArray(payload.knowledgeSnapshot.relations, `${name}.knowledgeSnapshot.relations`);
    return;
  }

  if (transition === "kernel-reflection->kernel-planning") {
    assertReflectionReportContract(payload.reflectionReport, `${name}.reflectionReport`);
    return;
  }

  if (transition === "kernel-planning->kernel-decision") {
    assertPlanningReportContract(payload.planningReport, `${name}.planningReport`);
  }
}

export function assertCognitiveHandoffContract(handoff, name = "handoff") {
  assertObject(handoff, name);

  if (handoff.schemaVersion !== cognitivePipelineContractVersion) {
    throw new Error(`${name}.schemaVersion must be ${cognitivePipelineContractVersion}`);
  }
  if (!STAGES.includes(handoff.from)) throw new Error(`${name}.from is unsupported`);
  if (!STAGES.includes(handoff.to)) throw new Error(`${name}.to is unsupported`);
  if (!TRANSITIONS.has(`${handoff.from}->${handoff.to}`)) {
    throw new Error(`${name} transition is not allowed`);
  }

  assertNonEmptyString(handoff.handoffId, `${name}.handoffId`);
  assertNonEmptyString(handoff.cycleId, `${name}.cycleId`);
  assertNonEmptyString(handoff.createdAt, `${name}.createdAt`);
  assertTenantContextContract(handoff.tenantContext, `${name}.tenantContext`);
  assertObject(handoff.payload, `${name}.payload`);
  assertImmutableFlags(handoff, name, ["mutationAllowed", "approvalAllowed", "executionAllowed"]);
  assertTransitionPayload(handoff.from, handoff.to, handoff.payload, `${name}.payload`);

  return handoff;
}

export function createCognitiveHandoff({
  handoffId,
  from,
  to,
  cycleId,
  tenantContext,
  payload,
  createdAt = new Date().toISOString(),
} = {}) {
  const handoff = {
    schemaVersion: cognitivePipelineContractVersion,
    handoffId,
    from: from,
    to: to,
    cycleId,
    tenantContext: clone(tenantContext),
    payload: clone(payload),
    createdAt,
    mutationAllowed: false,
    approvalAllowed: false,
    executionAllowed: false,
  };

  assertCognitiveHandoffContract(handoff);
  return Object.freeze(clone(handoff));
}
