
import assert from "node:assert/strict";
import test from "node:test";
import { createOperatorReadonlyHttpApp } from "./operator-readonly-http.mjs";
import { OperatorReadonlyError } from "./operator-readonly-contract.mjs";

function fixture({
  authenticated=true,
  scopes,
  coreOverrides={},
  auditFails=false,
  rateAllowed=true,
  authThrows=false,
  authorizationThrows=false,
}={}) {
  const calls={auth:0,decisions:[],audit:[],core:[],rate:[]};
  const identity=authenticated?{principal:{id:"operator-igor",tenantId:"uni.",scopes:scopes??[
    "operator:status:read","operator:inventory:read","operator:resource:read","operator.xaudit:read"
  ]}}:null;
  const core={
    async operatorStatus(input){calls.core.push(["status",input]); return {operationId:"operatorStatus",productionChanged:false,contentReturned:false,rowsReturned:false,valuesReturned:false,items:[]};},
    async operatorInventory(input){calls.core.push(["inventory",input]); return {operationId:"operatorInventory",productionChanged:false,contentReturned:false,rowsReturned:false,valuesReturned:false,items:[]};},
    async operatorRead(input){calls.core.push(["read",input]); return {operationId:"operatorRead",productionChanged:false,contentReturned:false,rowsReturned:false,valuesReturned:false,resource:{}};},
    async operatorAudit(input){calls.core.push(["audit",input]); return {operationId:"operatorAudit",productionChanged:false,contentReturned:false,rowsReturned:false,valuesReturned:false,events:[]};},
    ...coreOverrides,
  };
  const app=createOperatorReadonlyHttpApp({
    app:{async handleRequest(){return {status:404,headers:{},body:"{}"};}},
    authenticator:{async authenticate(){calls.auth++; if(authThrows) throw new Error("auth"); return identity;}},
    authorization:{async decide(input){calls.decisions.push(input); if(authorizationThrows) throw new Error("authorization"); const allowed=input.requiredScopes.every(s=>identity?.principal.scopes.includes(s)); return {decisionId:"d1",effect:allowed?"allow":"deny",policyVersion:"v1"};}},
    core,
    audit:{async recordOperatorCapabilityResult(event){calls.audit.push(event); if(auditFails) throw new Error("audit"); return {eventId:"a1"};}},
    rateLimiter:{consume(key){calls.rate.push(key); return {allowed:rateAllowed,remaining:rateAllowed?59:0,resetAt:Date.now()+60000};}},
  });
  return {app,calls};
}
const baseBody={correlationId:"corr_001",target:{provider:"github",resourceType:"repository"}};
async function post(app,path,body=baseBody,headers={}){return app.handleRequest({method:"POST",url:path,headers,body:JSON.stringify(body)});}
test("delegates unknown route",async()=>{const f=fixture();assert.equal((await f.app.handleRequest({method:"GET",url:"/x"})).status,404);});
test("rejects non POST",async()=>{const f=fixture();const r=await f.app.handleRequest({method:"GET",url:"/v1/operator/status"});assert.equal(r.status,405);assert.equal(r.headers.allow,"POST");});
test("enforces rate limit before authentication without exposing credential",async()=>{const f=fixture({rateAllowed:false});const r=await post(f.app,"/v1/operator/status",baseBody,{authorization:"Bearer secret-value"});assert.equal(r.status,429);assert.equal(f.calls.auth,0);assert.notEqual(f.calls.rate[0],"secret-value");});
test("rejects oversized body before authentication",async()=>{const f=fixture();const r=await f.app.handleRequest({method:"POST",url:"/v1/operator/status",body:"x".repeat(70000)});assert.equal(r.status,413);assert.equal(f.calls.auth,0);});
test("requires authentication and handles authentication outage",async()=>{const missing=fixture({authenticated:false});assert.equal((await post(missing.app,"/v1/operator/status")).status,401);const failed=fixture({authThrows:true});assert.equal((await post(failed.app,"/v1/operator/status")).status,503);});
test("derives tenant and operator from principal",async()=>{const f=fixture();const r=await post(f.app,"/v1/operator/status");assert.equal(r.status,200);assert.equal(f.calls.core[0][1].context.tenant,"uni.");assert.equal(f.calls.core[0][1].context.operator,"operator-igor");});
test("rejects spoofed context and unknown target fields",async()=>{const f=fixture();assert.equal((await post(f.app,"/v1/operator/status",{...baseBody,tenant:"other"})).status,400);assert.equal((await post(f.app,"/v1/operator/status",{...baseBody,target:{...baseBody.target,token:"x"}})).status,400);assert.equal(f.calls.core.length,0);});
test("enforces scope and records denial",async()=>{const f=fixture({scopes:[]});const r=await post(f.app,"/v1/operator/inventory");assert.equal(r.status,403);assert.equal(f.calls.core.length,0);assert.equal(f.calls.audit[0].outcome,"denied");});
test("denial remains denied when audit fails",async()=>{const f=fixture({scopes:[],auditFails:true});assert.equal((await post(f.app,"/v1/operator/audit")).status,403);});
test("handles authorization outage",async()=>{const f=fixture({authorizationThrows:true});assert.equal((await post(f.app,"/v1/operator/status")).status,503);});
test("routes all four operations with exact scopes",async()=>{const f=fixture();for(const [path,name] of [["/v1/operator/status","status"],["/v1/operator/inventory","inventory"],["/v1/operator/read","read"],["/v1/operator/audit","audit"]]){const body=name==="read"?{}..baseBody,target:{...baseBody.target,resourceId:"repo-1"},fields:["name"]}:baseBody;assert.equal((await post(f.app,path,body)).status,200);}assert.deepEqual(f.calls.core.map(x=>x[0]),["status","inventory","read","audit"]);assert.deepEqual(f.calls.decisions.map(x=>x.requiredScopes[0]),["operator:status:read","operator:inventory:read","operator:resource:read","operator:audit:read"]);});
test("maps adapter unavailable to 503",async()=>{const f=fixture({coreOverrides:{async operatorStatus(){throw new OperatorReadonlyError("adapter_unavailable","no");}}});const r=await post(f.app,"/v1/operator/status");assert.equal(r.status,503);assert.equal(JSON.parse(r.body).error,"adapter_unavailable");});
test("maps sensitive provider response to 502",async()=>{const f=fixture({coreOverrides:{async operatorRead(){throw new OperatorReadonlyError("provider_returned_sensitive_data","no");}}});const r=await post(f.app,"/v1/operator/read",{...baseBody,target:{...baseBody.target,resourceId:"repo-1"},fields:["name"]});assert.equal(r.status,502);});
test("requires resource id for read",async()=>{const f=fixture();const r=await post(f.app,"/v1/operator/read",{...baseBody,fields:["name"]});assert.equal(r.status,400);assert.equal(f.calls.core.length,0);});
