import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionEngine} from "../src/index.mjs";
const planning=(proposals)=>({
 planningId:"planning.1",sourceReflectionId:"reflection.1",mode:"advisory",
 mutationAllowed:false,approvalAllowed:false,executionAllowed:false,
 summary:{},proposals,tenantId:"tenant_1",cycleId:"cycle_1",
 constraints:{automaticMutationAllowed:false,automaticApprovalAllowed:false,automaticExecutionAllowed:false}
});
test("selects only ready candidate and never approves",()=>{
 const r=createDecisionEngine({clock:()=> "2026-07-26T00:00:00.000Z"}).decide({tenantId:"tenant_1",cycleId:"cycle_1",planningReport:planning([
  {proposalId:"p.high",priority:"high",rationale:"high",requiredEvidence:["e1"],requiredReviews:["security"],constitutionalConflict:false,decisionState:"proposed"},
  {proposalId:"p.low",priority:"low",rationale:"low",requiredEvidence:[],requiredReviews:[],constitutionalConflict:false,decisionState:"proposed"}
 ])},{evidence:[{id:"e1",status:"expired"}],reviews:[]});
 assert.equal(r.selectedProposalId,"p.low"); assert.equal(r.approved,false); assert.equal(r.executionAllowed,false); assert.equal(Object.isFrozen(r),true);
});
test("blocks cross tenant and constitutional conflict",()=>{
 const e=createDecisionEngine(); assert.throws(()=>e.decide({tenantId:"other",cycleId:"cycle_1",planningReport:planning([])}),/cross-tenant/);
 const r=e.decide({tenantId:"tenant_1",cycleId:"cycle_1",planningReport:planning([{proposalId:"p",priority:"critical",rationale:"x",requiredEvidence:[],requiredReviews:[],constitutionalConflict:true,decisionState:"blocked"}])});
 assert.equal(r.selectedProposalId,null); assert.equal(r.decisionState,"blocked");
});
