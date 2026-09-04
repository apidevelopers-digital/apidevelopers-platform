import{assertMembershipAccessGrantBinding as bindGrant,assertMembershipRoleBinding as bindRole}from"@apidevelopers/contracts";
import{createSaasAccessComposition}from"./saas-access-composition.mjs";
import{createWebAgentShadowPersistenceProviders}from"./web-agent-shadow-persistence-providers.mjs";
import{createWebInternationalContextResolver}from"./web-international-context-resolver.mjs";
import{createUniCoPreviewAuthenticationEvidenceResolver}from"./web-agent-preview-authentication-evidence.mjs";
export const UNI_ACCOUNT_PREVIEW_PRODUCT_ID="product:uni-co";
export class AccountAccessContextResolutionError extends Error{constructor(code,{status=503}={}){super(code);this.name="AccountAccessContextResolutionError";this.code=code;this.status=status}}
const txt=(v,n)=>{v=String(v??"").trim();if(!v)throw new AccountAccessContextResolutionError(`${n}_required`,{status:400});return v};
const fail=(c,s=503)=>{throw new AccountAccessContextResolutionError(c,{status:s})};
export function createPreviewAccountAccessContextResolver({store,clock=()=>new Date()}={}){
 if(!store||typeof store.read!=="function"||typeof store.transaction!=="function"||typeof store.executeIdempotent!=="function")throw new TypeError("persistence-core store required");
 const iso=()=>{const v=clock(),d=v instanceof Date?v:new Date(v);if(Number.isNaN(d.getTime()))throw new TypeError("invalid clock");return d.toISOString()};
 const{saasRuntime,saasAccess,membershipRuntime}=createSaasAccessComposition({store,clock:iso});
 const p=createWebAgentShadowPersistenceProviders({store});
 const intl=createWebInternationalContextResolver({tenantInternationalProfile:p.tenantInternationalProfile,commercialContext:p.commercialContext});
 const evidence=createUniCoPreviewAuthenticationEvidenceResolver({store,clock});
 return Object.freeze({async resolve({accountId,tenantId}={}){
  accountId=txt(accountId,"accountId");tenantId=txt(tenantId,"tenantId");
  const tenant=await saasRuntime.getTenant(tenantId);if(!tenant||tenant.status!=="active")fail("account_tenant_inactive_or_missing",403);
  const organizationId=txt(tenant.organizationId,"organizationId");
  const gr=await saasAccess.resolveActiveGrant({tenantId,principalId:accountId,productId:UNI_ACCOUNT_PREVIEW_PRODUCT_ID});
  if(!gr.resolved||!gr.grant)fail(gr.reason||"account_access_grant_not_found",403);const grant=gr.grant;
  const ws=await saasRuntime.getWorkspace(grant.workspaceId);
  if(!ws||ws.status!=="active"||ws.tenantId!==tenantId||ws.productId!==UNI_ACCOUNT_PREVIEW_PRODUCT_ID)fail("account_workspace_binding_mismatch",403);
  const mr=await membershipRuntime.resolveActiveMembership({tenantId,workspaceId:ws.workspaceId,principalId:accountId});
  if(!mr.resolved||!mr.membership)fail(mr.reason||"account_membership_not_found",403);const membership=mr.membership;
  const role=await membershipRuntime.getRole(membership.roleId);if(!role)fail("account_role_not_found",403);
  try{bindRole(membership,role);bindGrant(membership,grant)}catch{fail("account_membership_authority_mismatch",403)}
  const cr=await saasAccess.resolveCommercialContext({accessGrantId:grant.accessGrantId,tenantId,workspaceId:ws.workspaceId,productId:UNI_ACCOUNT_PREVIEW_PRODUCT_ID});
  const c=cr.commercial;if(!cr.resolved||!c||c.subscriptionStatus!=="active"||c.entitlement?.status!=="active")fail(cr.reason||"account_entitlement_inactive_or_missing",403);
  const ir=await intl.resolve({identity:{principal:{id:accountId,tenantId}},accessGrantId:grant.accessGrantId,workspaceId:ws.workspaceId,productId:UNI_ACCOUNT_PREVIEW_PRODUCT_ID});
  const m=ir?.context;if(!m)fail("account_international_context_missing");const country=String(m.legalRegion??"").trim().toUpperCase();if(!/^[A-Z]{2}$/.test(country))fail("account_country_not_iso_alpha2");
  const er=await evidence.resolveActive({principalId:accountId,tenantId});if(!er.resolved||!er.evidence)fail(er.reason||"account_authentication_evidence_missing",401);
  const e=er.evidence,a=e.authenticationContext,d=e.policyDecision;
  return Object.freeze({accountId,tenantId,organizationId,workspaceId:ws.workspaceId,accessGrantId:grant.accessGrantId,
   authorization:Object.freeze({roles:Object.freeze([role.key]),permissions:Object.freeze([...new Set(Array.isArray(role.permissions)?role.permissions:[])].sort())}),
   entitlements:Object.freeze([Object.freeze({entitlementId:c.entitlement.entitlementId,capability:c.entitlement.capability,status:c.entitlement.status,subscriptionId:c.subscriptionId,planId:c.planId})]),
   market:Object.freeze({country,locale:m.locale,timezone:m.timeZone,currency:m.currency,legalRegion:m.legalRegion}),
   trust:Object.freeze({assuranceLevel:a.assuranceLevel,factors:Object.freeze([...a.methods]),policyDecisionId:d.decisionId,correlationId:e.correlationId,timestamp:a.authenticatedAt,evidenceReference:e.evidenceId})});
 }});
}