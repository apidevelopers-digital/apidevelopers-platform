
import assert from "node:assert/strict";
import test from "node:test";
import { createOperatorReadonlyHttpApp } from "../src/operator-readonly-http.mjs";
import { OperatorReadonlyError } from "../src/operator-readonly-contract.mjs";

const BASE={correlationId:"corr_001",target:{provider:"github",resourceType:"repository"}};
function fx(o={}){
 const calls={auth:0,decisions:[],audit:[],core:[],rate:[]};
 const identity=o.authenticated===false?null:{principal:{id:"operator-igor",tenantId:"uni.",scopes:o.scopes??[
  "operator:status:read","operator:inventory:read","operator:resource:read","operator:audit:read"]}};
 const core={
  async operatorStatus(input){calls.core.push(["status",input]);return {operationId:"operatorStatus",productionChanged:false,contentReturned:false,rowsReturned:false,valuesReturned:false,items:[]}},
  async operatorInventory(input){calls.core.push(["inventory",input]);return {operationId:"operatorInventory",productionChanged:false,contentReturned:false,rowsReturned:false,valuesReturned:false,items:[]}},
  async operatorRead(input){calls.core.push(["read",input]);return {operationId:"operatorRead",productionChanged:false,contentReturned:false,rowsReturned:false,valuesReturned:false,resource:{}}},
  async operatorAudit(input){calls.core.push(["audit",input]);return {operationId:"operatorAudit",productionChanged:false,contentReturned:false,rowsReturned:false,valuesReturned:false,events:[]}},
  ...(o.core??{})
 };
 const app=createOperatorReadonlyHttpApp({
  app:{async handleRequest(){return {status:404,headers:{},body:"{}"}}},
  authenticator:{async authenticate(){calls.auth++;if(o.authThrows)throw Error("auth");return identity}},
  authorization:{async decide(input){calls.decisions.push(input);if(o.authorizationThrows)throw Error("authz");const ok=input.requiredScopes.every(s=>identity?.principal.scopes.includes(s));return {decisionId:"d1",effect:ok?"allow":"deny",policyVersion:"v1"}}},
  core,
  audit:{async recordOperatorCapabilityResult(e){calls.audit.push(e);if(o.auditFails)throw Error("audit");return {eventId:"a1"}}},
  rateLimiter:{consume(key){calls.rate.push(key);return {allowed:o.rateAllowed!==false,remaining:0,resetAt:Date.now()+60000}}},
 });
 return {app,calls};
}
const post=(app,path,body=BASE,headers={})=>app.handleRequest({method:"POST",url:path,headers,body:JSON.stringify(body)});

test("delegates unknown route",async()=>assert.equal((await fx().app.handleRequest({method:"GET",url:"/x"})).status,404));
test("rejects non POST",async()=>assert.equal((await fx().app.handleRequest({method:"GET",url:"/v1/operator/status"})).status,405));
test("rate limits before auth and hashes credential",async()=>{const f=fx({rateAllowed:false});const r=await post(f.app,"/v1/operator/status",BASE,{authorization:"Bearer secret-value"});assert.equal(r.status,429);assert.equal(f.calls.auth,0);assert.notEqual(f.calls.rate[0],"secret-value")});
test("rejects oversized body before auth",async()=>{const f=fx();const r=await f.app.handleRequest({method:"POST",url:"/v1/operator/status",body:"x".repeat(70000)});assert.equal(r.status,413);assert.equal(f.calls.auth,0)});
test("requires auth and handles auth outage",async()=>{assert.equal((await post(fx({authenticated:false}).app,"/v1/operator/status")).status,401);assert.equal((await post(fx({authThrows:true}).app,"/v1/operator/status")).status,503)});
test("derives context from principal",async()=>{const f=fx();assert.equal((await post(f.app,"/v1/operator/status")).status,200);assert.equal(f.calls.core[0][1].context.tenant,"uni.");assert.equal(f.calls.core[0][1].context.operator,"operator-igor")});
test("rejects spoofed context and unknown target keys",async()=>{const f=fx();assert.equal((await post(f.app,"/v1/operator/status",{...BASE,tenant:"other"})).status,400);assert.equal((await post(f.app,"/v1/operator/status",{...BASE,target:{...BASE.target,token:"x"}})).status,400);assert.equal(f.calls.core.length,0)});
test("enforces scope and audits denial",async()=>{const f=fx({scopes:[]});assert.equal((await post(f.app,"/v1/operator/inventory")).status,403);assert.equal(f.calls.core.length,0);assert.equal(f.calls.audit[0].outcome,"denied")});
test("handles authorization outage",async()=>assert.equal((await post(fx({authorizationThrows:true}).app,"/v1/operator/status")).status,503));
test("routes all operations with exact scopes",async()=>{const f=fx();for(const [path,name] of [["/v1/operator/status","status"],["/v1/operator/inventory","inventory"],["/v1/operator/read","read"],["/v1/operator/audit","audit"]]){const body=name==="read"?{...BASE,target:{...BASE.target,resourceId:"repo-1"},fields:["name"]}:BASE;assert.equal((await post(f.app,path,body)).status,200)}assert.deepEqual(f.calls.core.map(x=>x[0]),["status","inventory","read","audit"]);assert.deepEqual(f.calls.decisions.map(x=>x.requiredScopes[0]),["operator:status:read","operator:inventory:read","operator:resource:read","operator:audit:read"])});
test("maps adapter and sensitive errors",async()=>{const a=fx({core:{async operatorStatus(){throw new OperatorReadonlyError("adapter_unavailable","no")}}});assert.equal((await post(a.app,"/v1/operator/status")).status,503);const s=fx({core:{async operatorRead(){throw new OperatorReadonlyError("provider_returned_sensitive_data","no")}}});assert.equal((await post(s.app,"/v1/operator/read",{...BASE,target:{...BASE.target,resourceId:"repo-1"},fields:["name"]})).status,502)});
test("requires resource id for read",async()=>{const f=fx();assert.equal((await post(f.app,"/v1/operator/read",{...BASE,fields:["name"]})).status,400);assert.equal(f.calls.core.length,0)});
