import {
  RISK_LEVELS,
  assertHeader,
  bool,
  enumeration,
  finalize,
  header,
  id,
  string,
  strings,
} from "./global-trust-support.mjs";

export const USE_CASE_STATUSES = Object.freeze([
  "draft",
  "approved",
  "suspended",
  "retired",
]);
const USE_CASE_STATUS_SET = new Set(USE_CASE_STATUSES);

export function assertUseCaseDescriptorContract(
  value,
  name = "useCaseDescriptor",
) {
  assertHeader(value, "UseCaseDescriptor", name);
  id(value.useCaseId, `${name}.useCaseId`);
  id(value.tenantId, `${name}.tenantId`);
  id(value.ownerId, `${name}.ownerId`);
  string(value.purpose, `${name}.purpose`);
  id(value.dataPolicyId, `${name}.dataPolicyId`);
  enumeration(value.status, `${name}.status`, USE_CASE_STATUS_SET);
  enumeration(value.riskLevel, `${name}.riskLevel`, RISK_LEVELS);
  strings(value.allowedModelIds, `${name}.allowedModelIds`, {
    allowEmpty: false,
  });
  strings(value.allowedToolIds, `${name}.allowedToolIds`);
  strings(value.allowedLocales, `${name}.allowedLocales`, {
    allowEmpty: false,
  });
  bool(value.humanApprovalRequired, `${name}.humanApprovalRequired`);
  if (value.secretMaterialIncluded !== false) {
    throw new Error(`${name}.secretMaterialIncluded must be false`);
  }
  if (value.executablePayloadIncluded !== false) {
    throw new Error(`${name}.executablePayloadIncluded must be false`);
  }
  if (value.automaticExecutionAllowed !== false) {
    throw new Error(`${name}.automaticExecutionAllowed must be false`);
  }

  return value;
}

export function createUseCaseDescriptor({
  useCaseId,
  tenantId,
  ownerId,
  purpose,
  dataPolicyId,
  status = "draft",
  riskLevel,
  allowedModelIds,
  allowedToolIds = [],
  allowedLocales,
  humanApprovalRequired = true,
} = {}) {
  return finalize({
    ...header("UseCaseDescriptor"),
    useCaseId,
    tenantId,
    ownerId,
    purpose,
    dataPolicyId,
    status,
    riskLevel,
    allowedModelIds: [...new Set(allowedModelIds ?? [])].sort(),
    allowedToolIds: [...new Set(allowedToolIds ?? [])].sort(),
    allowedLocales: [...new Set(allowedLocales ?? [])].sort(),
    humanApprovalRequired,
    secretMaterialIncluded: false,
    executablePayloadIncluded: false,
    automaticExecutionAllowed: false,
  }, assertUseCaseDescriptorContract);
}
