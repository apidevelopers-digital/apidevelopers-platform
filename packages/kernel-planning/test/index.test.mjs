import test from "node:test";
import assert from "node:assert/strict";
import { createPlanningEngine } from "../src/index.mjs";
import { runGovernedPlanning, createPlanningDecisionHandoff } from "../src/governed.mjs";

const clock = () => "2026-07-25T13:00:00.000Z";
const reflection = (findings = [], extra = {}) => ({
  reflectionId: "reflection.001",
  generatedAt: "2026-07-25T12:00:00.000Z",
  requestedBy: "system",
  scope: "platform",
  tenantId: "tenant_001",
  cycleId: "cycle.001",
  mode: "advisory",
  mutationAlowed: false,
  summary: { status: "review", counts: { total: findings.length } },
  findings,
  ...extra,
});
const engine = () => createPlanningEngine({ clock });

test("requires tenant cycle and reflection", () => {
  assert.throws(() => engine().plan(), /tenantId/);
  assert.throws(() => engine().plan({tenantId:"t",cycleId:"c"}), /reflectionReport/);
});
test("blocks cross-tenant and cross-cycle reports", () => {
  assert.throws(() => engine().plan({tenantId:"other",cycleId:"cycle.001",reflectionReport:reflection()}), /cross-tenant/);
  assert.throws(() => engine().plan({tenantId:"tenant_001",cycleId:"other",reflectionReport:reflection()}), /cross-cycle/);
});
test("groups findings and preserves traceability", () => {
  const report = engine().plan({
    tenantId:"tenant_001", cycleId:"cycle.001",
    reflectionReport: reflection([
      {ruleId:"RSN-001",category:"architecture",severity:"medium",subject:"component.publisher",statement:"First.",evidence:["e1"]},
      {ruleId:"RSN-002",category:"architecture",severity:"low",subject:"component.publisher",statement:"Second.",evidence:["e2"]},
    ]),
  });
  assert.equal(report.proposals.length,1);
  assert.equal(report.proposals[0].findings.length,2);
  assert.deepEqual(report.proposals[0].sourceReferences,["RSN-001","RSN-002","reflection.001"]);
  assert.equal(report.tenantId,"tenant_001");
  assert.equal(report.cycleId,"cycle.001");
});
test("marks missing evidence and blocks constitutional conflicts", () => {
  const report = engine().plan( {
    tenantId:"tenant_001", cycleId:"cycle.001",
    reflectionReport: reflection([
      {ruleId:"RSN-003",severity:"medium",subject:"component.a",statement:"Missing evidence."},
      {ruleId:"RSN-004",severity:"critical",subject:"kernel.tenancy",statement:"Weakens isolation.",tags:["weaken-tenant-isolation"],evidence:["e4"]},
    ]),
  }, {impactAnalysis:{subject:"kernel.tenancy",complete:true}});
  const a = report.proposals.find((item)=>item.subject==="component.a");
  const b = report.proposals.find((item)=>item.subject==="kernel.tenancy");
  assert.equal(a.decisionState,"needs-evidence");
  assert.equal(b.decisionState,"blocked");
  assert.equal(b.constitutionalConflict,true);
});
test("requires impact analysis for high risk", () => {
  const report = engine().plan({
    tenantId:"tenant_001", cycleId:"cycle.001",
    reflectionReport: reflection([{ruleId:"RSN-HIGH",severity:"high",subject:"component.high",statement:"High.",evidence:["e"]}]),
  });
 assert.equal(report.proposals[0].decisionState,"needs-evidence");
  assert.ok(report.proposals[0].requiredEvidence.includes("impact-analysis:component.high"));
});
test("is deeply immutable and deterministic", () => {
  const input = reflection([{ruleId:"RSN-LOW",severity:"low",subject:"component.low",statement:"Stable.",evidence:["e"]}]);
  const before = structuredClone(input);
  const a = engine().plan({tenantId:"tenant_001",cycleId:"cycle.001",reflectionReport:input});
  const b = engine().plan({tenantId:"tenant_001",cycleId:"cycle.001",reflectionReport:input});
  assert.deepEqual(a,b);
  assert.deepEqual(input,before);
  assert.equal(Object.isFrozen(a),true);
  assert.equal(Object.isFrozen(a.proposals[0]),true);
  assert.throws(()=>{a.proposals[0].priority="critical";},TypeError);
});
test("runs governed reflection to planning and planning to decision handoffs", () => {
  const tenantContext = {schemaVersion:1,tenantId:"tenant_001",tenantIdOpaque:true,isolationMode:"strict",crossTenantAccessAllowed:false,globalOperation:false,principalId:"p",requestId:"r",roles:[],permissions:[],createdAt:"2026-07-25T12:00:00.000Z"};
  const handoff = {schemaVersion:1,handoffId:"h.ref.plan",from:"kernel-reflection",to:"Kernel-planning",cycleId:"cycle.001",tenantContext,payload:{reflectionReport:reflection([{ruleId:"RSN-1",severity:"low",subject:"component.a",statement:"A.",evidence:["e"]}])},createdAt:"2026-07-25T12:30:00.000Z",mutationAllowed:false,approvalAllowed:false,executionAllowed:false};
  const report = runGovernedPlanning({handoff,engine:engine()});
 assert.equal(report.sourceHandoffId,"h.ref.plan");
 const next = createPlanningDecisionHandoff({planningReport:report,tenantContext,handoffId:"h.plan.decision",createdAt:"2026-07-25T13:01:00.000Z"});
 assert.equal(next.from,"kernel-planning");
 assert.equal(next.to,"kernel-decision");
 assert.equal(next.mutationAllowed,false);
});
