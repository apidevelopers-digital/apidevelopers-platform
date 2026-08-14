import assert from "node:assert/strict";
import test from "node:test";
import { createGlobalTrustEvaluationOperatorProvisioningService } from "../src/global-trust-evaluation-operator-provisioning.mjs";

const SECRET="trust_eval_0123456789abcdefghijklmnopqrstuvwxyz";
const admin=()=>({role:"admin",principal:{id:"platform-admin",status:"active",scopes:["admin:*"]}});
const result=(issued=true)=>({
  created:issued,
  evaluation:{
    tenantId:"component.tenant.acme",workspaceId:"component.workspace.acme.evaluation",
    subscriptionId:"component.subscription.acme.trust",productId:"trust",planId:"evaluation",
    environment:"sandbox",status:"active",expiresAt:"2026-08-28T06:30:00.000Z",
    apiKeyId:"api-key-eval",apiKeyPrefix:SECRET.slice(0,12),
    scopes:["trust:evaluate","trust:audit:read","trust:evidence:read"],
    capabilities:["trust-evaluate","trust-audit-read","trust-evidence-read"],
    limits:{requestsPerMinute:60,maxAmountMinor:100000},
    controls:{financialEgress:"blocked",realMoney:false,biometricMaterialAccepted:false},
  },
  apiKey:{id:"api-key-eval",prefix:SECRET.slice(0,12),status:"active"},
  secret:issued?SECRET:null,secretIssued:issued,
});
function fx({value=result(),handoffError=null}={}){
  const audits=[],deliveries=[]; let creates=0;
  return {
    audits,deliveries,creates:()=>creates,
    service:createGlobalTrustEvaluationOperatorProvisioningService({
      evaluationTenantService:{async createEvaluation(){creates++;return value;}},
      audit:{async recordOperatorCapabilityResult(e){audits.push(structuredClone(e));return e;}},
      credentialHandoff:{async deliver(p){deliveries.push(structuredClone(p));if(handoffError)throw handoffError;}},
    }),
  };
}
const input=(identity=admin(),correlationId="corr-1")=>({
  identity,organizationId:"component.organization.acme",slug:"acme",displayName:"ACME",correlationId,
});

test("first provisioning hands off secret once but receipt and audit never contain it",async()=>{
  const f=fx(); const receipt=await f.service.provision(input());
  assert.equal(f.creates(),1); assert.equal(f.deliveries.length,1); assert.equal(f.deliveries[0].secret,SECRET);
  assert.equal(receipt.secretDelivered,true); assert.equal("secret" in receipt,false); assert.equal("hash" in receipt,false);
  assert.deepEqual(receipt.controls,{financialEgress:"blocked",realMoney:false,biometricMaterialAccepted:false});
  assert.equal(f.audits.length,1); assert.equal(f.audits[0].outcome,"success");
  assert.equal(f.audits[0].metadata.secretDelivered,true); assert.equal(JSON.stringify(f.audits[0]).includes(SECRET),false);
});

test("idempotent provisioning does not deliver or reissue secret",async()=>{
  const f=fx({value:result(false)}); const receipt=await f.service.provision(input(admin(),"corr-2"));
  assert.equal(f.deliveries.length,0); assert.equal(receipt.secretDelivered,false); assert.equal("secret" in receipt,false);
  assert.equal(f.audits[0].metadata.secretDelivered,false);
});

test("non-admin is rejected before tenant creation",async()=>{
  const f=fx(); const client={role:"client",principal:{id:"client-1",status:"active",scopes:["trust:evaluate"]}};
  await assert.rejects(f.service.provision(input(client,"corr-3")),e=>e.code==="TRUST_EVALUATION_OPERATOR_FORBIDDEN");
  assert.equal(f.creates(),0); assert.equal(f.deliveries.length,0); assert.equal(f.audits.length,0);
});

test("handoff failure is audited without secret and requires recovery",async()=>{
  const f=fx({handoffError:new Error("channel unavailable")});
  await assert.rejects(f.service.provision(input(admin(),"corr-4")),e=>e.code==="TRUST_EVALUATION_OPERATOR_HANDOFF_FAILED");
  assert.equal(f.deliveries.length,1); assert.equal(f.audits.length,1); assert.equal(f.audits[0].outcome,"failed");
  assert.equal(f.audits[0].metadata.errorCode,"credential_handoff_failed");
  assert.equal(f.audit.test[0].metadata.secretDelivered,false); assert.equal(JSON.stringify(f.audits[0]).includes(SECRET),false);
});
