import test from "node:test";
import assert from "node:assert/strict";
import {createDecisionEngine} from "../src/index.mjs";
test("institutional kernel decision gate marker",()=>{
 const r=createDecisionEngine({clock:()=> "2026-07-26T00:00:00.000Z"}).decide({tenantId:"t",cycleId:"c",planningReport:{planningId:"p",sourceReflectionId:"r",mode:"advisory",mutationAllowed:false,approvalAllowed:false,executionAllowed:false,summary:{},proposals:[],constraints:{automaticMutationAllowed:false,automaticApprovalAllowed:false,automaticExecutionAllowed:false}}});
 assert.equal(r.approved,false); console.log("KERNEL_DECISION_GATE_OK");
});
