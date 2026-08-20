import { authorize } from "@apidevelopers/auth-core";
import {
  createAccessGrantId, createCanonicalId, createEntitlementId,
  createProvisioningJobId, createSubscriptionId, createTenantId, createWorkspaceId,
} from "@apidevelopers/contracts";

const PRODUCT_ID="product:uni-co", PRODUCT_SLUG="uni-co";
const PROVIDER="unico-operator-session", SCOPE="saas:provision";
const PLAN_ID="internal-preview", WEB_SCOPE="web:chat";
const HEX64=/^[a-f0-9]{64}$/, SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IDEM=/^[A-Za-z0-9_.:-]{8,200}$/;

const reply=(status,payload)=>Object.freeze({
  status,
  headers:Object.freeze({"content-type":"application/json; charset=utf-8","cache-control":"no-store"}),
  body:JSON.stringify(payload),
});
function req(value,name){const out=String(value??"").trim();if(!out)throw new TypeError(`${name}_required`);return out;}
function reqSlug(value,name){const out=req(value,name).toLowerCase();if(!SLUG.test(out))throw new TypeError(`${name}_invalid`);return out;}
function bodyOf(value){
  if(value&&typeof value==="object"&&!Array.isArray(value))return value;
  const raw=String(value??"").trim();if(!raw)throw new TypeError("body_required");
  const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new TypeError("body_invalid");
  return parsed;
}
function same(actual,expected,code){if(actual!==expected)throw new Error(code);}
function pkey(id){const out=req(id,"principalId").split(".").at(-1);if(!SLUG.test(out))throw new Error("principal_key_invalid");return out;}

export function createUniCoProvisioningApp({authenticator,saasRuntime,saasAccess,federatedPrincipal,clock=()=>new Date().toISOString()}={}){
  for(const [name,fn] of Object.entries({
    authenticate:authenticator?.authenticate,registerTenantWorkspace:saasRuntime?.registerTenantWorkspace,
    getSubscription:saasRuntime?.getSubscription,startSubscription:saasRuntime?.startSubscription,
    activateSubscription:saasRuntime?.activateSubscription,getEntitlement:saasRuntime?.getEntitlement,
    grantEntitlement:saasRuntime?.grantEntitlement,getProvisioningJob:saasRuntime?.getProvisioningJob,
    enqueueProvisioning:saasRuntime?.enqueueProvisioning,claimProvisioning:saasRuntime?.claimProvisioning,
    completeProvisioning:saasRuntime?.completeProvisioning,
    resolveFederatedPrincipal:federatedPrincipal?.resolveFederatedPrincipal,
    resolveActiveGrant:saasAccess?.resolveActiveGrant,grantAccess:saasAccess?.grantAccess,
    activateAccess:saasAccess?.activateAccess,setOnboarding:saasAccess?.setOnboarding,
  })) if(typeof fn!=="function")throw new TypeError(`${name}_function_required`);

  return Object.freeze({async handleRequest({method="GET",url="/",headers={},body=""}={}){
    const path=new URL(String(url),"http://gateway.local").pathname;
    if(String(method).toUpperCase()!=="POST"||path!=="/v1/saas/uni-co/provision")return null;
    const actor=await authenticator.authenticate(headers);
    if(!actor)return reply(401,{ok:false,reason:"unauthorized"});
    const authz=authorize(actor,{scopes:[SCOPE]});
    if(!authz.allowed)return reply(403,{ok:false,reason:"provision_scope_forbidden",missingScopes:authz.missingScopes});
    try{
      const input=bodyOf(body), tenantSlug=reqSlug(input.tenantSlug,"tenantSlug"), workspaceSlug=reqSlug(input.workspaceSlug,"workspaceSlug");
      const displayName=req(input.displayName,"displayName"), subjectRef=req(input.subjectRef,"subjectRef").toLowerCase();
      const idempotencyKey=req(input.idempotencyKey,"idempotencyKey");
      if(!HEX64.test(subjectRef))throw new TypeError("subjectRef_invalid");
      if(!IDEM.test(idempotencyKey))throw new TypeError("idempotencyKey_invalid");
      const at=clock(), tenantId=createTenantId(tenantSlug), workspaceId=createWorkspaceId(tenantSlug,workspaceSlug);
      const subscriptionId=createSubscriptionId(tenantSlug,PRODUCT_SLUG);
      const entitlementId=createEntitlementId(tenantSlug,workspaceSlug,"web-chat");
      const provisioningJobId=createProvisioningJobId(tenantSlug,workspaceSlug,PRODUCT_SLUG);

      await saasRuntime.registerTenantWorkspace({
        tenant:{tenantId,organizationId:createCanonicalId({family:"component",segments:["organization",tenantSlug]}),slug:tenantSlug,displayName,status:"active",createdAt:at},
        workspace:{workspaceId,tenantId,productId:PRODUCT_ID,slug:workspaceSlug,displayName:`${displayName} · uni.co`,status:"active",createdAt:at},
      });

      let sub=await saasRuntime.getSubscription(subscriptionId);
      if(!sub)sub=await saasRuntime.startSubscription({subscriptionId,tenantId,productId:PRODUCT_ID,planId:PLAN_ID,status:"assisted_activation",currency:"BRL",monthlyAmount:0,createdAt:at});
      else {same(sub.tenantId,tenantId,"subscription_binding_mismatch");same(sub.productId,PRODUCT_ID,"subscription_binding_mismatch");same(sub.planId,PLAN_ID,"subscription_binding_mismatch");same(sub.monthlyAmount,0,"subscription_binding_mismatch");}
      if(sub.status!=="active"){if(!["assisted_activation","trial"].includes(sub.status))throw new Error("subscription_not_activatable");sub=await saasRuntime.activateSubscription({subscriptionId,activatedAt:at});}

      let ent=await saasRuntime.getEntitlement(entitlementId);
      if(!ent)ent=await saasRuntime.grantEntitlement({entitlementId,subscriptionId,tenantId,workspaceId,productId:PRODUCT_ID,capability:"web-chat",status:"active",sourcePlanId:PLAN_ID,createdAt:at});
      else {same(ent.tenantId,tenantId,"entitlement_binding_mismatch");same(ent.workspaceId,workspaceId,"entitlement_binding_mismatch");same(ent.productId,PRODUCT_ID,"entitlement_binding_mismatch");same(ent.subscriptionId,subscriptionId,"entitlement_binding_mismatch");if(ent.status!=="active")throw new Error("entitlement_not_active");}

      let job=await saasRuntime.getProvisioningJob(provisioningJobId);
      if(!job)job=(await saasRuntime.enqueueProvisioning({provisioningJobId,subscriptionId,tenantId,workspaceId,productId:PRODUCT_ID,entitlementIds:[entitlementId],idempotencyKey,requestedAt:at})).job;
      if(job.idempotencyKey!==idempotencyKey)throw new Error("provisioning_idempotency_mismatch");
      if(job.status==="queued")job=await saasRuntime.claimProvisioning({provisioningJobId,at});
      if(job.status==="running")job=await saasRuntime.completeProvisioning({provisioningJobId,at,result:{tenantReady:true,workspaceReady:true,productReady:true,mode:"uni_co_internal_preview"}});
      if(job.status!=="succeeded")throw new Error("provisioning_not_ready");

      const principal=await federatedPrincipal.resolveFederatedPrincipal({tenantId,provider:PROVIDER,externalSubject:subjectRef,subjectType:"delegated_subject_ref"});
      const accessGrantId=createAccessGrantId(tenantSlug,workspaceSlug,PRODUCT_SLUG,pkey(principal.principalId));
      let resolved=await saasAccess.resolveActiveGrant({tenantId,principalId:principal.principalId,productId:PRODUCT_ID});
      if(!resolved.resolved){
        const pending=await saasAccess.grantAccess({accessGrantId,principalId:principal.principalId,tenantId,workspaceId,productId:PRODUCT_ID,subscriptionId,entitlementId,requiredScopes:[WEB_SCOPE],grantedScopes:[WEB_SCOPE],status:"pending",createdAt:at});
        if(pending.status!=="pending")throw new Error("access_grant_not_pending");
        resolved={resolved:true,grant:await saasAccess.activateAccess({accessGrantId,provisioningJobId,at})};
      }
      const grant=resolved.grant;
      same(grant.workspaceId,workspaceId,"access_binding_mismatch");same(grant.productId,PRODUCT_ID,"access_binding_mismatch");same(grant.principalId,principal.principalId,"access_binding_mismatch");
      await saasAccess.setOnboarding({tenantId,workspaceId,productId:PRODUCT_ID,status:"completed",requiredSteps:["provisioning_succeeded","access_activated"],completedSteps:["provisioning_succeeded","access_activated"],updatedAt:at});
      return reply(201,{ok:true,provisioned:true,tenantId,workspaceId,principalId:principal.principalId,accessGrantId:grant.accessGrantId,productId:PRODUCT_ID,status:"active",billing:{mode:"internal-preview",currency:"BRL",monthlyAmount:0},secretsExposed:false});
    }catch(error){
      const message=String(error?.message??""), invalid=/required|invalid|JSON|idempotency/i.test(message);
      return reply(invalid?400:409,{ok:false,reason:invalid?"invalid_uni_co_provision_request":"uni_co_provisioning_failed",secretsExposed:false});
    }
  }});
}
export const uniCoProvisioningContract=Object.freeze({
  path:"/v1/saas/uni-co/provision",productId:PRODUCT_ID,provider:PROVIDER,requiredScope:SCOPE,
  grantedProductScopes:Object.freeze([WEB_SCOPE]),automaticLoginProvisioning:false,billingMode:"internal-preview",monthlyAmount:0,
});
