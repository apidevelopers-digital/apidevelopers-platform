import test from "node:test";
import assert from "node:assert/strict";
import { createPlanningEngine } from "../src/index.mjs";

const reflection = (overrides={}) => ({
  reflectionId:"reflection.001", tenantId:"tenant_001", cycleId:"cycle.001", mode:"advisory",
  findings:[
    { ruleId:"REF-001", subject:"component.alpha", category:"architecture", severity:"high", statement:"Component lacks an owned contract.", recommendation:"Attach an owned contract.", evidence:["ev.001"] },
    { ruleId:"REF-002", subject:"component.alpha", category:"architecture", severity:"medium", statement:"Owner is not registered." }
  ],
  ...overrides
});

test("requires tenant, cycle and governed reflection", ()=>{
  const engine=createPlanningEngine();
  assert.throws(()=>engine.plan(), /tenantId/);
  assert.throws(()=>engine.plan({tenantId:"t",cycleId:"c",reflectionReport:reflection({tenantId:"x",cycleId:"c"})}), /cross-tenant/);
  assert.throws(()=>engine.plan({tenantId:"tenant_001",cycleId:"x",reflectionReport:reflection()}), /cycle mismatch/);
});

test("creates deterministic immutable advisory proposals", ()=>{
  const engine=createPlanningEngine({clock:()=> "2026-07-25T13:00:00.000Z"});
  const report=engine.plan({tenantId:"tenant_001",cycleId:"cycle.001",reflectionReport:reflection()},{
    requestedBy:"operator", impactAnalysis:{subject:"component.alpha",complete:true}
  });
  assert.equal(report.planningId,"planning.20260725130000000");
  assert.equal(report.mode,"advisory");
  assert.equal(report.mutationAllowed,false);
  assert.equal(report.executionAllowed,false);
  assert.equal(report.proposals.length,1);
  assert.equal(report.proposals[0].priority,"high");
  assert.equal(report.proposals[0].decisionState,"needs-review");
  assert.equal(report.proposals[0].impactAnalysisComplete,true);
  assert.equal(report.proposals[0].humanApprovalRequired,true);
  assert.equal(Object.isFrozen(report),true);
  assert.equal(Object.isFrozen(report.proposals[0]),true);
});

test("requires impact analysis and evidence for high priority proposals", ()=>{
  const report=createPlanningEngine({clock:()=> "2026-07-25T13:00:00.000Z"}).plan({
    tenantId:"tenant_001",cycleId:"cycle.001",
    reflectionReport:reflection({findings:[{ruleId:"REF-001",subject:"critical.x",severity:"critical",statement:"Critical issue."}]})
  });
  assert.equal(report.proposals[0].decisionState,"needs-evidence");
  assert.deepEqual(report.proposals[0].requiredEvidence,["evidence:critical.x","impact-analysis:critical.x"]);
});

test("blocks constitutional conflicts", ()=>{
  const report=createPlanningEngine({clock:()=> "2026-07-25T13:00:00.000Z"}).plan({
    tenantId:"tenant_001",cycleId:"cycle.001",
    reflectionReport:reflection({findings:[{ruleId:"REF-C",subject:"authority",severity:"critical",statement:"Conflict.",constitutionalConflict:true,evidence:["ev"]}]})
  },{impactAnalysis:{complete:true}});
  assert.equal(report.proposals[0].decisionState,"blocked");
  assert.equal(report.proposals[0].constitutionalConflict,true);
});

test("does not mutate reflection input", ()=>{
  const source=reflection(); const before=structuredClone(source);
  createPlanningEngine({clock:()=> "2026-07-25T13:00:00.000Z"}).plan({tenantId:"tenant_001",cycleId:"cycle.001",reflectionReport:source});
  assert.deepEqual(source,before);
});
