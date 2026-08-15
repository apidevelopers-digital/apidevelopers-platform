import {
  assertHeader,
  bool,
  enumeration,
  finalize,
  header,
  id,
  positiveInteger,
  string,
  strings,
} from "./global-trust-support.mjs";

export const DATA_POLICY_STATUSES = Object.freeze([
  "draft",
  "approved",
  "suspended",
  "retired",
]);

export const DATA_POLICY_DATA_CLASSES = Object.freeze([
  "public",
  "internal",
  "confidential",
  "pii",
  "financial",
  "health",
  "biometric",
]);

const STATUS_SET = new Set(DATA_POLICY_STATUSES);
const DATA_CLASS_SET = new Set(DATA_POLICY_DATA_CLASSES);
const SENSITIVE_CLASSES = new Set([
  "confidential",
  "pii",
  "financial",
  "health",
  "biometric",
]);

function assertDataClasses(values, name) {
  const normalized = strings(values, name, { allowEmpty: false });
  for (const value of normalized) {
    enumeration(value, `${name}.${value}`, DATA_CLASS_SET);
  }
  return normalized;
}

export function assertDataPolicyDescriptorContract(
  value,
  name = "dataPolicyDescriptor",
) {
  assertHeader(value, "DataPolicyDescriptor", name);
  id(value.dataPolicyId, `${name}.dataPolicyId`);
  id(value.tenantId, `${name}.tenantId`);
  id(value.ownerId, `${name}.ownerId`);
  string(value.purpose, `${name}.purpose`);
  enumeration(value.status, `${name}.status`, STATUS_SET);
  const dataClasses = assertDataClasses(value.allowedDataClasses, `${name}.allowedDataClasses`);
  strings(value.allowedRegions, `${name}.allowedRegions`, { allowEmpty: false });
  const retentionDays = positiveInteger(value.retentionDays, `${name}.retentionDays`);
  if (retentionDays > 3650) {
    throw new Error(`${name}.retentionDays must not exceed 3650`);
  }
  bool(value.promptPersistenceAllowed, `${name}.promptPersistenceAllowed`);
  bool(value.responsePersistenceAllowed, `${name}.responsePersistenceAllowed`);
  bool(value.providerTrainingAllowed, `${name}.providerTrainingAllowed`);
  bool(value.crossTenantSharingAllowed, `${name}.crossTenantSharingAllowed`);
  bool(value.redactionRequired, `${name}.redactionRequired`);
  bool(
    value.humanReviewRequiredForSensitiveData,
    `${name}.humanReviewRequiredForSensitiveData`,
  );

  if (value.providerTrainingAllowed !== false) {
    throw new Error(`${name}.providerTrainingAllowed must be false`);
  }
  if (value.crossTenantSharingAllowed !== false) {
    throw new Error(`${name}.crossTenantSharingAllowed must be false`);
  }
  if (
    dataClasses.some((item) => SENSITIVE_CLASSES.has(item))
    && value.redactionRequired !== true
  ) {
    throw new Error(`${name}.redactionRequired must be true for sensitive data`);
  }
  if (
    dataClasses.some((item) => SENSITIVE_CLASSES.has(item))
    && value.humanReviewRequiredForSensitiveData !== true
  ) {
    throw new Error(
      `${name}.humanReviewRequiredForSensitiveData must be true for sensitive data`,
    );
  }
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

export function createDataPolicyDescriptor({
  dataPolicyId,
  tenantId,
  ownerId,
  purpose,
  status = "draft",
  allowedDataClasses,
  allowedRegions,
  retentionDays,
  promptPersistenceAllowed = false,
  responsePersistenceAllowed = false,
  providerTrainingAllowed = false,
  crossTenantSharingAllowed = false,
  redactionRequired = true,
  humanReviewRequiredForSensitiveData = true,
} = {}) {
  return finalize({
    ...header("DataPolicyDescriptor"),
    dataPolicyId,
    tenantId,
    ownerId,
    purpose,
    status,
    allowedDataClasses: [...new Set(allowedDataClasses ?? [])].sort(),
    allowedRegions: [...new Set(allowedRegions ?? [])].sort(),
    retentionDays,
    promptPersistenceAllowed,
    responsePersistenceAllowed,
    providerTrainingAllowed,
    crossTenantSharingAllowed,
    redactionRequired,
    humanReviewRequiredForSensitiveData,
    secretMaterialIncluded: false,
    executablePayloadIncluded: false,
    automaticExecutionAllowed: false,
  }, assertDataPolicyDescriptorContract);
}
