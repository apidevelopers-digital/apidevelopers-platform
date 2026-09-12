import test from "node:test";
import assert from "node:assert/strict";
import { createUniJuriAccessGrantWriter, UNIJURI_ACCESS_WRITE_APPROVAL } from "../src/saas-unijuri-access-grant-writer.mjs";

const binding={tenantId:"component.tenant.uni",workspaceId:"component.workspace.uni.juri",subscriptionId:"component.subscription.uni.uni-juri",entitlementId:"component.entitlement.uni.juri.use-product",provisioningJobId:"component.provisioning.uni.juri",accessGrantId:"component.access.uni.juri.igor",principalId:"component.principal.igor",productId:"uni-juri"};
const auth={authenticate:async()=>({role:"service",principal:{id:"operator",scopes:["saas:uni-juri:access:write"]}})};
const runtime=()=>({
 getTenant:async()=>({status:"active"}),
 getWorkspace:async()=>({status:"active",tenantId:binding.tenantId,productId:"uni-juri"}),
 getSubscription:async()=>({status:"active",tenantId:binding.tenantId,productId:"uni-juri"}),
 getEntitlement:async()=>({status:"active",subscriptionId:binding.subscriptionId,tenantId:binding.tenantId,workspaceId:binding.workspaceId,productId:"uni-juri"}),
 getProvisioningJob:async()=>({status:"succeeded",subscriptionId:binding.subscriptionId,tenantId:binding.tenantId,workspaceId:binding.workspaceId,productId:"uni-juri"}),
 grantAccess:async(input)=>({...input,status:"pending"}),
 activateAccess:async({accessGrantId})=>({accessGrantId,status:"active"})
});

test("fails closed unless writes and approval are explicit",async()=>{
 const writer=createUniJuriAccessGrantWriter({authenticator:auth,runtime:runtime(),audit:async()=>{}});
 const out=await writer.provision({approval:UNIJURI_ACCESS_WRITE_APPROVAL,binding});
 assert.equal(out.status,423); assert.equal(out.writesExecuted,false);
});

test("rejects non UniJuri product before writing",async()=>{
 const writer=createUniJuriAccessGrantWriter({authenticator:auth,runtime:runtime(),audit:async()=>{},writeEnabled:true});
 const out=await writer.provision({approval:UNIJURI_ACCESS_WRITE_APPROVAL,binding:{...binding,productId:"zuni"}});
 assert.equal(out.status,400); assert.equal(out.writesExecuted,false);
});

test("validates commercial context before writing",async()=>{
 let writes=0; const r=runtime(); r.getSubscription=async()=>({status:"pending"}); r.grantAccess=async()=>{writes+=1};
 const writer=createUniJuriAccessGrantWriter({authenticator:auth,runtime:r,audit:async()=>{},writeEnabled:true});
 const out=await writer.provision({approval:UNIJURI_ACCESS_WRITE_APPROVAL,binding});
 assert.equal(out.status,409); assert.equal(writes,0);
});

test("creates active use_product grant without charging or exposing secrets",async()=>{
 let audited=false; const writer=createUniJuriAccessGrantWriter({authenticator:auth,runtime:runtime(),audit:async()=>{audited=true},writeEnabled:true});
 const out=await writer.provision({approval:UNIJURI_ACCESS_WRITE_APPROVAL,binding});
 assert.equal(out.status,201); assert.equal(out.writesExecuted,true); assert.equal(out.chargeExecuted,false); assert.equal(out.secretsExposed,false); assert.equal(audited,true);
});
