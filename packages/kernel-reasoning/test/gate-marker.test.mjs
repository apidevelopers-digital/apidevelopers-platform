import test from "node:test";
import assert from "node:assert/strict";
import { createReasoningEngine } from "../src/index.mjs";
test("institutional kernel reasoning gate marker",()=>{
 const report=createReasoningEngine({clock:()=> "2026-07-25T00:00:00.000Z"}).infer({
  tenantId:"tenant_gate",cycleId:"cycle_gate",
  knowledgeSnapshot:{nodes:[],relations:[]},
  memorySnapshot:{schemaVersion:1,tenantId:"tenant_gate",mode:"append-only",mutationAllowed:false,entryCount:0,chainHead:null,entries:[]}
 });
 assert.equal(report.mode,"read-only");
 assert.equal(report.mutationAllowed,false);
 console.log("KERNEL_REASONING_GATE_OK");
});
