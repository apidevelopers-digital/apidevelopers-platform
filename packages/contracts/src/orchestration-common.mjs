import { assertTenantContextContract } from "./tenancy-context.mjs";

export const orchestrationContractVersion = 1;

export function orchestrationClone(value) {
  return value == null ? value : structuredClone(value);
}

export function orchestrationDeepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) orchestrationDeepFreeze(child);
  return value;
}

export function orchestrationAssertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

export function orchestrationAssertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

export function orchestrationAssertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

export function orchestrationNormalizeStrings(
  value,
  name,
  { required = false } = {},
) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  const normalized = value.map((item, index) => {
    orchestrationAssertString(item, `${name}[${index}]`);
    return item.trim();
  });
  const unique = [...new Set(normalized)].sort();
  if (required && unique.length === 0) {
    throw new TypeError(`${name} must be a non-empty array`);
  }
  return unique;
}

export function orchestrationAssertVersion(value, name) {
  if (value !== orchestrationContractVersion) {
    throw new Error(
      `${name}.schemaVersion must be ${orchestrationContractVersion}`,
    );
  }
}

export function orchestrationAssertFalse(value, name) {
  if (value !== false) throw new Error(`${name} must be false`);
}

export function orchestrationAssertTrue(value, name) {
  if (value !== true) throw new Error(`${name} must be true`);
}

export function orchestrationAssertIsoDate(value, name) {
  orchestrationAssertString(value, name);
  if (Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be an ISO date`);
  }
}

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
  if (
    approval.consumedAt != null ||
    approval.replayed === true ||
    approval.used === true
  ) {
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
  assertHumanApprovalContract(approval, "humanApproval", {
    requireFresh: false,
  });
  return orchestrationDeepFreeze(orchestrationClone(approval));
}

export function assertAgentManifestContract(
  manifest,
  name = "agentManifest",
) {
  orchestrationAssertObject(manifest, name);
  orchestrationAssertVersion(manifest.schemaVersion, name);
  for (const field of ["agentId", "role", "version"]) {
    orchestrationAssertString(manifest[field], `${name}.${field}`);
  }
  assertTenantContextContract(
    manifest.tenantContext,
    `${name}.tenantContext`,
  );
  orchestrationNormalizeStrings(
    manifest.capabilities,
    `${name}.capabilities`,
    { required: true },
  );
  orchestrationNormalizeStrings(manifest.dataScopes, `${name}.dataScopes`);
  orchestrationNormalizeStrings(
    manifest.prohibitedActions,
    `${name}.prohibitedActions`,
  );
  orchestrationAssertPositiveInteger(
    manifest.maxAssignments,
    `${name}.maxAssignments`,
  );
  orchestrationAssertTrue(
    manifest.humanApprovalRequired,
    `${name}.humanApprovalRequired`,
  );
  orchestrationAssertFalse(
    manifest.crossTenantAccessAllowed,
    `${name}.crossTenantAccessAllowed`,
  );
  orchestrationAssertFalse(
    manifest.automaticExecutionAllowed,
    `${name}.automaticExecutionAllowed`,
  );
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
    capabilities: orchestrationNormalizeStrings(
      capabilities,
      "capabilities",
      { required: true },
    ),
    dataScopes: orchestrationNormalizeStrings(dataScopes, "dataScopes"),
    prohibitedActions: orchestrationNormalizeStrings(
      prohibitedActions,
      "prohibitedActions",
    ),
    maxAssignments,
    humanApprovalRequired: true,
    crossTenantAccessAllowed: false,
    automaticExecutionAllowed: false,
  };
  assertAgentManifestContract(manifest);
  return orchestrationDeepFreeze(manifest);
}
