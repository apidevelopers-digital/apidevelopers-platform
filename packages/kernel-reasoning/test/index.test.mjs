import test from "node:test";
import assert from "node:assert/strict";
import { createReasoningEngine } from "../src/index.mjs";

const clock=()=> "2026-07-25T12:00:00.000Z";
const memory=(tenantId="tenant_001")=>({schemaVersion:1,tenantId,mode:"append-only",mutationAllowed:false,entryCount:0,chainHead:null,entries:[]});
const knowledge=()=>({nodes:[
  {id:"capability.publish",kind:"capability",status:"active"},
  {id:"component.orphan",kind:"component",status:"active"},
  {id:"policy.unbound",kind:"policy",status:"active"},
],relations:[]});

test("requires tenant and cycle",()=>{
 const e=createReasoningEngine({clock});
 assert.throws(()=>e.infer(),/tenantId/);
});
test("blocks cross-tenant memory",()=>{
 const e=createReasoningEngine({clock});
 assert.throws(()=>e.infer({tenantId:"tenant_001",cycleId:"c1",knowledgeSnapshot:knowledge(),memorySnapshot:memory("tenant_002")}),/cross-tenant/);
});
test("produces deterministic immutable report",()=>{
 const e=createReasoningEngine({clock});
 const report=e.infer({tenantId:"tenant_001",cycleId:"c1",knowledgeSnapshot:knowledge(),memorySnapshot:memory()});
 assert.equal(report.reasoningId,"reasoning.20260725120000000");
 assert.equal(report.generatedAt,clock());
 assert.equal(report.tenantId,"tenant_001");
 assert.equal(report.mode,"read-only");
 assert.equal(report.mutationAllowed,false);
 assert.equal(report.constraints.automaticDecisionAllowed,false);
 assert.equal(report.constraints.automaticExecutionAllowed,false);
 assert.deepEqual(report.conclusions.map(x=>x.ruleId),["RSN-001","RSN-002","RSN-004"]);
 assert.equal(Object.isFrozen(report),true);
 assert.equal(Object.isFrozen(report.summary),true);
});
test("detects dependency cycles",()=>{
 const e=createReasoningEngine({clock});
 const report=e.infer({tenantId:"tenant_001",cycleId:"c1",memorySnapshot:memory(),knowledgeSnapshot:{
  nodes:[{id:"component.a",kind:"component",status:"active"},{id:"component.b",kind:"component",status:"active"}],
  relations:[{from:"component.a",to:"component.b",type:"depends_on"},{from:"component.b",to:"component.a",type:"depends_on"}]
 }});
 assert.equal(report.conclusions.some(x=>x.ruleId==="RSN-003"),true);
});
test("does not mutate inputs",()=>{
 const e=createReasoningEngine({clock});
 const k=knowledge(); const m=memory(); const before=structuredClone({k,m});
 e.infer({tenantId:"tenant_001",cycleId:"c1",knowledgeSnapshot:k,memorySnapshot:m});
 assert.deepEqual({k,m},before);
});
