import assert from "node:assert/strict";
import test from "node:test";
import { createUniCoProvisioningApp, uniCoProvisioningContract } from "../src/saas-uni-co-provisioning.mjs";

const NOW="2026-08-20T16:30:00.000Z", SUBJECT="a".repeat(64);
function actor(scopes=["saas:provision"]){return Object.freeze({role:"service",principal:Object.freeze({id:"provisioner",status:"active",scopes:Object.freeze(scopes)})});}

function harness({auth=actor()}={}){
  const state={subscription:null,entitlement:null,job:null,grant:null,onboarding:null,registrations:0,jobs:0,grants:0,principalInput:null};
  const saasRuntime={
    async registerTenantWorkspace(){state.registrations+=1;},
    async getSubscription(){return state.subscription;},
    async startSubscription(input){state.subscription=Object.freeze({...input});return state.subscription;},
    async activateSubscription({activatedAt}){state.subscription=Object.freeze({...state.subscription,status:"active",activatedAt});return state.subscription;},
    async getEntitlement(){return state.entitlement;},
    async grantEntitlement(input){state.entitlement=Object.freeze({...input});return state.entitlement;},
    async getProvisioningJob(){return state.job;},
    async enqueueProvisioning(input){state.jobs+=1;state.job=Object.freeze({...input,status:"queued"});return Object.freeze({created:true,job:state.job});},
    async claimProvisioning({at}){state.job=Object.freeze({...state.job,status:"running",startedAt:at});return state.job;},
    async completeProvisioning({at,result}){state.job=Object.freeze({...state.job,status:"succeeded",completedAt:at,result});return state.job;},
  };
  const federatedPrincipal={
    async resolveFederatedPrincipal(input){
      state.principalInput=input;
      return Object.freeze({principalId:"component.principal.0123456789abcdef0123456789abcdef",tenantId:input.tenantId,status:"active"});
    },
  };
  const saasAccess={
    async resolveActiveGrant(){return state.grant?Object.freeze({resolved:true,reason:null,grant:state.grant}):Object.freeze({resolved:false,reason:"access_grant_not_found",grant:null});},
    async grantAccess(input){state.grants+=1;state.grant=Object.freeze({...input});return state.grant;},
    async activateAccess({provisioningJobId,at}){state.grant=Object.freeze({...state.grant,status:"active",provisioningJobId,activatedAt:at});return state.grant;},
    async setOnboarding(input){state.onboarding=Object.freeze({...input});return state.onboarding;},
  };
  const app=createUniCoProvisioningApp({
    authenticator:{async authenticate(){return auth;}},
    saasRuntime,saasAccess,federatedPrincipal,clock:()=>NOW,
  });
  return {app,state};
}
function payload(overrides={}){
  return {
    tenantSlug:"institution-preview",
    workspaceSlug:"uni-co-main",
    displayName:"Institution Preview",
    subjectRef:SUBJECT,
    idempotencyKey:"uni-co-bootstrap-20260820",
    ...overrides,
  };
}
async function provision(app,body=payload()){
  return app.handleRequest({method:"POST",url:"/v1/saas/uni-co/provision",body});
}

test("uni.co provisioning contract is fixed, explicit and not tied to login automation", () => {
  assert.equal(uniCoProvisioningContract.productId,"product:uni-co");
  assert.equal(uniCoProvisioningContract.provider,"unico-operator-session");
  assert.equal(uniCoProvisioningContract.requiredScope,"saas:provision");
  assert.deepEqual(uniCoProvisioningContract.grantedProductScopes,["web:chat"]);
  assert.equal(uniCoProvisioningContract.automaticLoginProvisioning,false);
  assert.equal(uniCoProvisioningContract.monthlyAmount,0);
});

test("governed uni.co bootstrap creates one active binding and is idempotent", async () => {
  const {app,state}=harness();
  const first=await provision(app);
  assert.equal(first.status,201);
  const body=JSON.parse(first.body);
  assert.equal(body.ok,true);
  assert.equal(body.productId,"product:uni-co");
  assert.equal(body.status,"active");
  assert.equal(body.billing.monthlyAmount,0);
  assert.equal(state.subscription.productId,"product:uni-co");
  assert.equal(state.subscription.monthlyAmount,0);
  assert.equal(state.entitlement.capability,"web-chat");
  assert.deepEqual(state.grant.requiredScopes,["web:chat"]);
  assert.deepEqual(state.grant.grantedScopes,["web:chat"]);
  assert.equal(state.grant.status,"active");
  assert.equal(state.principalInput.provider,"unico-operator-session");
  assert.equal(state.principalInput.externalSubject,SUBJECT);
  assert.equal(state.principalInput.subjectType,"delegated_subject_ref");
  assert.equal(state.onboarding.status,"completed");
  assert.equal(JSON.stringify(body).includes(SUBJECT),false);

  const second=await provision(app);
  assert.equal(second.status,201);
  assert.equal(state.jobs,1);
  assert.equal(state.grants,1);
});

test("uni.co bootstrap rejects unhashed subject and missing provision scope before state mutation", async () => {
  const invalid=harness();
  const invalidResponse=await provision(invalid.app,payload({subjectRef:"user@example.com"}));
  assert.equal(invalidResponse.status,400);
  assert.equal(invalid.state.registrations,0);

  const forbidden=harness({auth:actor(["saas:access:delegate"])});
  const forbiddenResponse=await provision(forbidden.app);
  assert.equal(forbiddenResponse.status,403);
  assert.equal(forbidden.state.registrations,0);
});
