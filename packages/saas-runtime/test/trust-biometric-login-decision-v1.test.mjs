import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJsonFileStore } from "../../persistence-core/src/index.mjs";
import { createAccessRuntime } from "../src/access.mjs";
import { TRUST_BIOMETRIC_LOGIN_DECISION_V1 as PROFILE, createTrustBiometricLoginDecision as create } from "../src/trust-biometric-login-decision-v1.mjs";

const D = (c) => `sha256:${c.repeat(64)}`;
const req = (o={}) => ({environment:"sandbox",tenantId:"tenant-1",verificationId:"v1",subjectRef:"s1",providerSessionRef:"ps1",consentRef:"c1",...o});
const bio = (o={}) => ({providerId:"trust-face-sandbox",providerReference:"ref1",adapterMode:"sandbox-conformance",status:"completed",modality:"face",livenessPerformed:true,signals:{faceMatchScore:.93,livenessScore:.91,livenessPassed:true},productionAuthorized:false,rawBiometricMaterialForwarded:false,rawBiometricMaterialPersisted:false,...o});

function harness(o={}) {
  const calls={bio:0,policy:0,principal:0,grant:0,access:0};
  const biometricAdapter=o.biometricAdapter??{async verifyFaceLiveness(){calls.bio++;return bio();}};
  const evaluateBiometricPolicy=o.evaluateBiometricPolicy??(async()=>{calls.policy++;return{allowed:true,policyId:"p1",policyDigest:D("a"),productionValidated:false,reason:null};});
  const resolvePrincipalBySubjectRef=o.resolvePrincipalBySubjectRef??(async()=>{calls.principal++;return{id:"principal-1",tenantId:"tenant-1",status:"active",scopes:["product:read"]};});
  const accessRuntime=o.accessRuntime??{
    async resolveActiveGrant(){calls.grant++;return{resolved:true,grant:{accessGrantId:"grant-1"}};},
    async evaluateAccess(){calls.access++;return{allowed:true};}
  };
  return {calls,flow:create({biometricAdapter,evaluateBiometricPolicy,resolvePrincipalBySubjectRef,accessRuntime})};
}

test("profile is sandbox-only",()=>{
  assert.equal(PROFILE.productionEnabled,false);
  assert.equal(PROFILE.rawBiometricMaterialAccepted,false);
  assert.equal(PROFILE.sessionIssuanceEnabled,false);
  assert.equal(PROFILE.modality,"face");
});

test("authorized decision reaches SaaS access",async()=>{
  const {flow,calls}=harness();
  const r=await flow.login({biometricRequest:req(),workspaceId:"w1",productId:"p1"});
  assert.equal(r.status,"authorized");
  assert.equal(r.identity.principal.authenticationMethod,"trust_biometric_face_sandbox");
  assert.equal(r.access.accessGrantId,"grant-1");
  assert.equal(r.session.issued,false);
  assert.equal(r.productionReady,false);
  assert.deepEqual(calls,{bio:1,policy:1,principal:1,grant:1,access:1});
});

test("liveness failure stops early",async()=>{
  const h=harness();
  const flow=create({
    biometricAdapter:{async verifyFaceLiveness(){h.calls.bio++;return bio({signals:{faceMatchScore:.9,livenessScore:.2,livenessPassed:false}});}},
    evaluateBiometricPolicy:async()=>{h.calls.policy++;return{allowed:true,policyId:"p",policyDigest:D("a"),productionValidated:false};},
    resolvePrincipalBySubjectRef:async()=>{h.calls.principal++;return null;},
    accessRuntime:{async resolveActiveGrant(){h.calls.grant++;return{resolved:false};},async evaluateAccess(){h.calls.access++;return{allowed:false};}}
  });
  const r=await flow.login({biometricRequest:req(),workspaceId:"w1",productId:"p1"});
  assert.equal(r.reason,"biometric_liveness_not_passed");
  assert.equal(h.calls.policy,0);
  assert.equal(h.calls.principal,0);
});

test("policy denial stops before principal",async()=>{
  const h=harness();
  const flow=create({
    biometricAdapter:{async verifyFaceLiveness(){h.calls.bio++;return bio();}},
    evaluateBiometricPolicy:async()=>{h.calls.policy++;return{allowed:false,policyId:"p",policyDigest:D("b"),productionValidated:false,reason:"face_match_below_sandbox_threshold"};},
    resolvePrincipalBySubjectRef:async()=>{h.calls.principal++;return null;},
    accessRuntime:{async resolveActiveGrant(){h.calls.grant++;return{resolved:false};},async evaluateAccess(){h.calls.access++;return{allowed:false};}}
  });
  const r=await flow.login({biometricRequest:req(),workspaceId:"w1",productId:"p1"});
  assert.equal(r.stage,"biometric_policy");
  assert.equal(r.reason,"face_match_below_sandbox_threshold");
  assert.equal(h.calls.principal,0);
});

test("missing principal stops before grant",async()=>{
  const h=harness({resolvePrincipalBySubjectRef:async()=>null});
  const r=await h.flow.login({biometricRequest:req(),workspaceId:"w1",productId:"p1"});
  assert.equal(r.stage,"principal");
  assert.equal(r.reason,"biometric_principal_not_resolved");
  assert.equal(h.calls.grant,0);
});

test("missing grant stops before access",async()=>{
  const h=harness({accessRuntime:{async resolveActiveGrant(){return{resolved:false,reason:"access_grant_not_found",grant:null};},async evaluateAccess(){throw new Error("must not run");}}});
  const r=await h.flow.login({biometricRequest:req(),workspaceId:"w1",productId:"p1"});
  assert.equal(r.stage,"grant");
  assert.equal(r.reason,"access_grant_not_found");
});

test("SaaS denial propagates fail-closed",async()=>{
  const h=harness({accessRuntime:{async resolveActiveGrant(){return{resolved:true,grant:{accessGrantId:"g1"}};},async evaluateAccess(){return{allowed:false,reason:"scope_forbidden"};}}});
  const r=await h.flow.login({biometricRequest:req(),workspaceId:"w1",productId:"p1"});
  assert.equal(r.stage,"access");
  assert.equal(r.reason,"scope_forbidden");
});

test("raw biometric input is rejected before adapter",async()=>{
  const h=harness();
  await assert.rejects(
    ()=>h.flow.login({biometricRequest:req({rawImage:"x"}),workspaceId:"w1",productId:"p1"}),
    e=>e.code==="raw_biometric_material_forbidden"
  );
  assert.equal(h.calls.bio,0);
});

test("production request and production policy are blocked",async()=>{
  const h=harness();
  await assert.rejects(
    ()=>h.flow.login({biometricRequest:req({environment:"production"}),workspaceId:"w1",productId:"p1"}),
    e=>e.code==="production_not_authorized"
  );
  const p=harness({evaluateBiometricPolicy:async()=>({allowed:true,policyId:"prod",policyDigest:D("c"),productionValidated:true})});
  await assert.rejects(
    ()=>p.flow.login({biometricRequest:req(),workspaceId:"w1",productId:"p1"}),
    e=>e.code==="production_policy_not_authorized"
  );
});

test("authorized decision integrates with real access runtime",async()=>{
  const tenantId="component.tenant.tenant-1";
  const workspaceId="component.workspace.workspace-1";
  const productId="product-1";
  const principalId="principal-1";
  const accessGrantId="component.access.tenant-1.workspace-1.product-1.principal-1";
  const dir=await mkdtemp(join(tmpdir(),"apd-biometric-login-"));
  const store=createJsonFileStore({filePath:join(dir,"state.json"),fsync:false,clock:()=> "2026-09-02T20:00:00.000Z"});
  const accessRuntime=createAccessRuntime({store,saasRuntime:{},clock:()=> "2026-09-02T20:00:00.000Z"});
  try {
    await accessRuntime.grantAccess({
      accessGrantId,principalId,tenantId,workspaceId,productId,
      subscriptionId:"component.subscription.subscription-1",
      entitlementId:"component.entitlement.entitlement-1",
      requiredScopes:["product:read"],status:"active",
      createdAt:"2026-09-02T20:00:00.000Z",activatedAt:"2026-09-02T20:00:00.000Z"
    });
    const flow=create({
      biometricAdapter:{async verifyFaceLiveness(){return bio();}},
      evaluateBiometricPolicy:async()=>({allowed:true,policyId:"p1",policyDigest:D("a"),productionValidated:false}),
      resolvePrincipalBySubjectRef:async()=>({id:principalId,tenantId,status:"active",scopes:["product:read"]}),
      accessRuntime
    });
    const r=await flow.login({biometricRequest:req({tenantId}),workspaceId,productId});
    assert.equal(r.status,"authorized");
    assert.equal(r.access.accessGrantId,accessGrantId);
    assert.equal(r.session.issued,false);
    assert.equal(r.productionReady,false);
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});
