import { object, VERSION } from "./global-trust-support.mjs";
import {
  assertAuthenticationContextContract,
  assertAuthorizationDecisionContract,
  assertCredentialMetadataContract,
  assertIdentitySubjectContract,
  assertTenantContextContract,
} from "./global-trust-identity.mjs";
import {
  assertModelDescriptorContract,
  assertRiskAssessmentContract,
  assertSafetyDecisionContract,
  assertToolInvocationPolicyContract,
} from "./global-trust-ai-safety.mjs";
import {
  assertAuditEventContract,
  assertEvidenceRecordContract,
  assertLocaleContextContract,
} from "./global-trust-audit-locale.mjs";

export * from "./global-trust-identity.mjs";
export * from "./global-trust-ai-safety.mjs";
export * from "./global-trust-audit-locale.mjs";

export const globalTrustCommonContractVersion = VERSION;
export const globalTrustCommonContractTypes = Object.freeze([
  "IdentitySubject",
  "TenantContext",
  "AuthenticationContext",
  "AuthorizationDecision",
  "CredentialMetadata",
  "RiskAssessment",
  "ModelDescriptor",
  "ToolInvocationPolicy",
  "SafetyDecision",
  "AuditEvent",
  "EvidenceRecord",
  "LocaleContext",
]);

const ASSERTIONS = new Map([
  ["IdentitySubject", assertIdentitySubjectContract],
  ["TenantContext", assertTenantContextContract],
  ["AuthenticationContext", assertAuthenticationContextContract],
  ["AuthorizationDecision", assertAuthorizationDecisionContract],
  ["CredentialMetadata", assertCredentialMetadataContract],
  ["RiskAssessment", assertRiskAssessmentContract],
  ["ModelDescriptor", assertModelDescriptorContract],
  ["ToolInvocationPolicy", assertToolInvocationPolicyContract],
  ["SafetyDecision", assertSafetyDecisionContract],
  ["AuditEvent", assertAuditEventContract],
  ["EvidenceRecord", assertEvidenceRecordContract],
  ["LocaleContext", assertLocaleContextContract],
]);

export function assertGlobalTrustCommonContract(value, name = "contract") {
  object(value, name);
  const assertion = ASSERTIONS.get(value.contractType);
  if (!assertion) throw new Error(`${name}.contractType is unsupported`);
  return assertion(value, name);
}
