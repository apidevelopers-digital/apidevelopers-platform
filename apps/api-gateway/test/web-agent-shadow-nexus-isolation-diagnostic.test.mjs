import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createSaasAccessComposition } from "../src/saas-access-composition.mjs";

const T0="2026-08-15T18:00:00.000Z", T1="2026-08-15T18:01:00.000Z", T2="2026-08-15T18:02:00.000Z";
const tenantId="component.tenant.web-agent-isolation-diagnostic";
const orgId="component.organization.web-agent-isolation-diagnostic";
const principalId="user:web-agent-isolation-diagnostic";
const products=Object.freeze({
  uni:Object.freeze({workspaceId:"component.workspace.web-agent-isolation-diagnostic.uni",productId:"product:uni-co",subscriptionId:"component.subscription.web-agent-isolation-diagnostic.uni",entitlementId:"component.entitlement.web-agent-isolation-diagnostic.uni",jobId:"component.provisioning.web-agent-isolation-diagnostic.uni",grantId:"component.access.web-agent-isolation-diagnostic.uni",slug:"uni-co"}),
  nexus:Object.freeze({workspaceId:"component.workspace.web-agent-isolation-diagnostic.nexus",productId:"product:nexus",subscriptionId:"component.subscription.web-agent-isolation-diagnostic.nexus",entitlementId:"component.entitlement.web-agent-isolation-diagnostic.nexus",jobId:"component.provisioning.web-agent-isolation-diagnostic.nexus",grantId:"component.access.web-agent-isolation-diagnostic.nexus",slug:"nexus"}),
});

async function ctx(t){
  const dir=await mkdtemp(join(tmpdir(),"apd-web-agent-isolation-diagnostic-"));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=createJsonFileStore({filePath:join(dir,"state.json"),fsync:false,clock:()=>T0});
  const {saasRuntime,saasAccess}=createSaasAccessComposition({store,clock:()=>T0});
  return {saasRuntime,saasAccess};
}

async function seed({saasRuntime,saasAccess,p}){
  await saasRuntime.registerTenantWorkspace({
    tenant:{tenantId,organizationId:orgId,slug:"web-agent-isolation-diagnostic",displayName:"Web Agent Isolation Diagnostic",status:"active",createdAt:T0},
    workspace:{workspaceId:p.workspaceId,tenantId,productId:p.productId,slug:p.slug,displayName:p.slug,status:"active",createdAt:T0},
  });
  await saasRuntime.startSubscription({subscriptionId:p.subscriptionId,tenantId,productId:p.productId,planId:"shadow-isolation",status:"assisted_activation",currency:"BRL",monthlyAmount:0,createdAt:T0});
  await saasRuntime.activateSubscription({subscriptionId:p.subscriptionId,activatedAt:T1});
  await saasRuntime.grantEntitlement({entitlementId:p.entitlementId,subscriptionId:p.subscriptionId,tenantId,workspaceId:p.workspaceId,productId:p.productId,capability:"web-agent",status:"active",sourcePlanId:"shadow-isolation",createdAt:T0});
  await saasRuntime.enqueueProvisioning({provisioningJobId:p.jobId,subscriptionId:p.subscriptionId,tenantId,workspaceId:p.workspaceId,productId:p.productId,entitlementIds:[p.entitlementId],idempotencyKey:`web-agent-isolation-diagnostic:${p.slug}:v1`,requestedAt:T0});
  await saasRuntime.claimProvisioning({provisioningJobId:p.jobId,at:T1});
  await saasRuntime.completeProvisioning({provisioningJobId:p.jobId,result:{productReady:true},at:T2});
  await saasAccess.grantAccess({accessGrantId:p.grantId,principalId,tenantId,workspaceId:p.workspaceId,productId:p.productId,subscriptionId:p.subscriptionId,entitlementId:p.entitlementId,requiredScopes:["web:chat"],status:"pending",createdAt:T0});
  await saasAccess.activateAccess({accessGrantId:p.grantId,provisioningJobId:p.jobId,at:T2});
}
const identity=Object.freeze({principal:Object.freeze({id:principalId,tenantId,status:"active",scopes:Object.freeze(["web:chat"])})});

test("dual-product lifecycle activates uni.co and NEXUS grants", async t=>{
  const {saasRuntime,saasAccess}=await ctx(t);
  await seed({saasRuntime,saasAccess,p:products.uni});
  await seed({saasRuntime,saasAccess,p:products.nexus});
  assert.equal((await saasRuntime.getWorkspace(products.uni.workspaceId)).productId,products.uni.productId);
  assert.equal((await saasRuntime.getWorkspace(products.nexus.workspaceId)).productId,products.nexus.productId);
  assert.equal((await saasAccess.evaluateAccess({identity,accessGrantId:products.uni.grantId,tenantId,workspaceId:products.uni.workspaceId,productId:products.uni.productId})).allowed,true);
  assert.equal((await saasAccess.evaluateAccess({identity,accessGrantId:products.nexus.grantId,tenantId,workspaceId:products.nexus.workspaceId,productId:products.nexus.productId})).allowed,true);
});

test("access matrix denies cross-product grant reuse", async t=>{
  const {saasRuntime,saasAccess}=await ctx(t);
  await seed({saasRuntime,saasAccess,p:products.uni});
  await seed({saasRuntime,saasAccess,p:products.nexus});
  const a=await saasAccess.evaluateAccess({identity,accessGrantId:products.uni.grantId,tenantId,workspaceId:products.nexus.workspaceId,productId:products.nexus.productId});
  const b=await saasAccess.evaluateAccess({identity,accessGrantId:products.nexus.grantId,tenantId,workspaceId:products.uni.workspaceId,productId:products.uni.productId});
  assert.deepEqual({allowed:a.allowed,reason:a.reason},{allowed:false,reason:"access_context_mismatch"});
  assert.deepEqual({allowed:b.allowed,reason:b.reason},{allowed:false,reason:"access_context_mismatch"});
});
