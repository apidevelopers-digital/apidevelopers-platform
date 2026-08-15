import {
  ASSURANCE_LEVELS,
  CREDENTIAL_STATUSES,
  CREDENTIAL_TYPES,
  DECISION_EFFECTS,
  SUBJECT_STATUSES,
  SUBJECT_TYPES,
  assertHeader,
  bool,
  enumeration,
  finalize,
  header,
  id,
  iso,
  optionalString,
  plainMetadata,
  string,
  strings,
} from "./global-trust-support.mjs";

export function assertIdentitySubjectContract(value, name = "identitySubject") {
  assertHeader(value, "IdentitySubject", name);
  id(value.subjectId, `${name}.subjectId`);
  id(value.tenantId, `${name}.tenantId`);
  enumeration(value.subjectType, `${name}.subjectType`, SUBJECT_TYPES);
  enumeration(value.status, `${name}.status`, SUBJECT_STATUSES);
  optionalString(value.displayName, `${name}.displayName`);
  plainMetadata(value.attributes, `${name}.attributes`);
  return value;
}

export function createIdentitySubject({
  subjectId,
  tenantId,
  subjectType,
  status = "active",
  displayName = null,
  attributes = {},
} = {}) {
  return finalize({
    ...header("IdentitySubject"),
    subjectId,
    tenantId,
    subjectType,
    status,
    displayName,
    attributes: plainMetadata(attributes, "attributes"),
  }, assertIdentitySubjectContract);
}

export function assertTenantContextContract(value, name = "tenantContext") {
  assertHeader(value, "TenantContext", name);
  id(value.tenantId, `${name}.tenantId`);
  string(value.region, `${name}.region`);
  if (value.isolationMode !== "strict") throw new Error(`${name}.isolationMode must be strict`);
  if (value.crossTenantAccessAllowed !== false) throw new Error(`${name}.crossTenantAccessAllowed must be false`);
  strings(value.scopes, `${name}.scopes`);
  return value;
}

export function createTenantContext({
  tenantId,
  region,
  scopes = [],
} = {}) {
  return finalize({
    ...header("TenantContext"),
    tenantId,
    region,
    isolationMode: "strict",
    crossTenantAccessAllowed: false,
    scopes: strings(scopes, "scopes"),
  }, assertTenantContextContract);
}

export function assertAuthenticationContextContract(value, name = "authenticationContext") {
  assertHeader(value, "AuthenticationContext", name);
  id(value.authenticationId, `${name}.authenticationId`);
  id(value.subjectId, `${name}.subjectId`);
  id(value.tenantId, `${name}.tenantId`);
  strings(value.methods, `${name}.methods`, { allowEmpty: false });
  enumeration(value.assuranceLevel, `${name}.assuranceLevel`, ASSURANCE_LEVELS);
  iso(value.authenticatedAt, `${name}.authenticatedAt`);
  iso(value.expiresAt, `${name}.expiresAt`);
  if (Date.parse(value.expiresAt) <= Date.parse(value.authenticatedAt)) {
    throw new Error(`${name}.expiresAt must be after authenticatedAt`);
  }
  if (value.secretMaterialIncluded !== false) throw new Error(`${name}.secretMaterialIncluded must be false`);
  return value;
}

export function createAuthenticationContext({
  authenticationId,
  subjectId,
  tenantId,
  methods,
  assuranceLevel,
  authenticatedAt = new Date().toISOString(),
  expiresAt,
} = {}) {
  return finalize({
    ...header("AuthenticationContext"),
    authenticationId,
    subjectId,
    tenantId,
    methods: strings(methods ?? [], "methods", { allowEmpty: false }),
    assuranceLevel,
    authenticatedAt,
    expiresAt,
    secretMaterialIncluded: false,
  }, assertAuthenticationContextContract);
}

export function assertAuthorizationDecisionContract(value, name = "authorizationDecision") {
  assertHeader(value, "AuthorizationDecision", name);
  id(value.decisionId, `${name}.decisionId`);
  id(value.subjectId, `${name}.subjectId`);
  id(value.tenantId, `${name}.tenantId`);
  string(value.action, `${name}.action`);
  string(value.resource, `${name}.resource`);
  enumeration(value.effect, `${name}.effect`, DECISION_EFFECTS);
  string(value.policyVersion, `${name}.policyVersion`);
  strings(value.reasonCodes, `${name}.reasonCodes`, { allowEmpty: false });
  iso(value.decidedAt, `${name}.decidedAt`);
  bool(value.humanApprovalRequired, `${name}.humanApprovalRequired`);
  if (value.effect === "pending_approval" && value.humanApprovalRequired !== true) {
    throw new Error(`${name}.humanApprovalRequired must be true for pending_approval`);
  }
  return value;
}

export function createAuthorizationDecision({
  decisionId,
  subjectId,
  tenantId,
  action,
  resource,
  effect,
  policyVersion,
  reasonCodes,
  humanApprovalRequired = effect === "pending_approval",
  decidedAt = new Date().toISOString(),
} = {}) {
  return finalize({
    ...header("AuthorizationDecision"),
    decisionId,
    subjectId,
    tenantId,
    action,
    resource,
    effect,
    policyVersion,
    reasonCodes: strings(reasonCodes ?? [], "reasonCodes", { allowEmpty: false }),
    humanApprovalRequired,
    decidedAt,
  }, assertAuthorizationDecisionContract);
}

export function assertCredentialMetadataContract(value, name = "credentialMetadata") {
  assertHeader(value, "CredentialMetadata", name);
  id(value.credentialId, `${name}.credentialId`);
  id(value.subjectId, `${name}.subjectId`);
  id(value.tenantId, `${name}.tenantId`);
  enumeration(value.credentialType, `${name}.credentialType`, CREDENTIAL_TYPES);
  enumeration(value.status, `${name}.status`, CREDENTIAL_STATUSES);
  iso(value.issuedAt, `${name}.issuedAt`);
  if (value.expiresAt != null) iso(value.expiresAt, `${name}.expiresAt`);
  if (value.expiresAt != null && Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) {
    throw new Error(`${name}.expiresAt must be after issuedAt`);
  }
  if (value.secretMaterialIncluded !== false) throw new Error(`${name}.secretMaterialIncluded must be false`);
  return value;
}

export function createCredentialMetadata({
  credentialId,
  subjectId,
  tenantId,
  credentialType,
  status = "active",
  issuedAt = new Date().toISOString(),
  expiresAt = null,
} = {}) {
  return finalize({
    ...header("CredentialMetadata"),
    credentialId,
    subjectId,
    tenantId,
    credentialType,
    status,
    issuedAt,
    expiresAt,
    secretMaterialIncluded: false,
  }, assertCredentialMetadataContract);
}

