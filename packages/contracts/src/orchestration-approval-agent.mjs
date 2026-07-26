import { assertTenantContextContract } from "./tenancy-context.mjs";
import {
  orchestrationAssertFalse,
  orchestrationAssertIsoDate,
  orchestrationAssertObject,
  orchestrationAssertPositiveInteger,
  orchestrationAssertString,
  orchestrationAssertTrue,
  orchestrationAssertVersion,
  orchestrationClone,
  orchestrationContractVersion,
  orchestrationDeepFreeze,
  orchestrationNormalizeStrings,
} from "./orchestration-common.mjs";

export function assertHumanApprovalContract(
  approval,
  name = "humanApproval",
  {
    tenantId,
    cycleId,
    missionId,
    now = new Date().toISOString(),
    requireFresh = true,
  } = {},
) {
  orchestrationAssertObject(approval, name);
  orchestrationAssertVersion(approval.schemaVersion, name);
  for (const field of [
    "approvalId",
    "status",
    "approvedBy",
    "approvedAt",
    "expiresAt",
    "tenantId",
    "cycleId",
    "missionId",
  ]) {
    orchestrationAssertString(approval[field], `${name}.${field}`);
  }
  if (approval.status !== "approved") {
    throw new Error(`${name}.status must be approved`);
  }
  if (approval.consumedAt != null || approval.replayed === true || approval.used === true) {
    throw new Error(`${name} approval replay is blocked`);
  }
  if (tenantId && approval.tenantId !== tenantId) {
    throw new Error(`${name} tenantId mismatch`);
  }
  if (cycleId && approval.cycleId !== cycleId) {
    throw new Error(`${name} cycleId mismatch`);
  }
  if (missionId && approval.missionId !== missionId) {
    throw new Error(`${name} missionId mismatch`);
  }
  orchestrationAssertIsoDate(approval.approvedAt, `${name}.approvedAt`);
  orchestrationAssertIsoDate(approval.expiresAt, `${name}.expiresAt`);
  orchestrationAssertIsoDate(now, `${name}.now`);
  if (Date.parse(approval.expiresAt) <= Date.parse(approval.approvedAt)) {
    throw new Error(`${name}.expiresAt must be after approvedAt`);
  }
  if (requireFresh && Date.parse(approval.expiresAt) <= Date.parse(now)) {
    throw new Error(`${name} must be fresh`);
  }
  return approval;
}

export function createHumanApproval({
  approvalId,
  approvedBy,
  tenantId,
  cycleId,
  missionId,
  approvedAt = new Date().toISOString(),
  expiresAt,
} = {}) {
  const approval = {
    schemaVersion: orchestrationContractVersion,
    approvalId,
    status: "approved",
    approvedBy,
    approvedAt,
    expiresAt,
    tenantId,
    cycleId,
    missionId,
    consumedAt: null,
    replayed: false,
    used: false,
  };
  assertHumanApprovalContract(approval, "humanApproval", { requireFresh: false });
  return orchestrationDeepFreeze(orchestrationClone(approval));
}

export function assertAgentManifestContract(manifest, name = "agentManifest") {
  orchestrationAssertObject(manifest, name);
  orchestrationAssertVersion(manifest.schemaVersion, name);
  for (const field of ["agentId", "role", "version"]) {
    orchestrationAssertString(manifest[field], `${name}.${field}`);
  }
  assertTenantContextContract(manifest.tenantContext, `${name}.tenantContext`);
  orchestrationNormalizeStrings(manifest.capabilities, `${name}.capabilities`, { required: true });
  orchestrationNormalizeStrings(manifest.dataScopes, `${name}.dataScopes`);
  orchestrationNormalizeStrings(manifest.prohibitedActions, `${name}.prohibitedActions`);
  orchestrationAssertPositiveInteger(manifest.maxAssignments, `${name}.maxAssignments`);
  orchestrationAssertTrue(manifest.humanApprovalRequired, `${name}.humanApprovalRequired`);
  orchestrationAssertFalse(manifest.crossTenantAccessAllowed, `${name}.crossTenantAccessAllowed`);
  orchestrationAssertFalse(manifest.automaticExecutionAllowed, `${name}.automaticExecutionAllowed`);
  return manifest;
}

export function createAgentManifest({
  agentId,
  role,
  version,
  tenantContext,
  capabilities,
  dataScopes = [],
  prohibitedActions = [],
  maxAssignments = 1,
} = {}) {
  const manifest = {
    schemaVersion: orchestrationContractVersion,
    agentId,
    role,
    version,
    tenantContext: orchestrationClone(tenantContext),
    capabilities: orchestrationNormalizeStrings(capabilities, "capabilities", { required: true }),
    dataScopes: orchestrationNormalizeStrings(dataScopes, "dataScopes"),
    prohibitedActions: orchestrationNormalizeStrings(prohibitedActions, "prohibitedActions"),
    maxAssignments,
    humanApprovalRequired: true,
    crossTenantAccessAllowed: false,
    automaticExecutionAllowed: false,
  };
  assertAgentManifestContract(manifest);
  return orchestrationDeepFreeze(manifest);
}
