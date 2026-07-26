import test from "node:test";
import assert from "node:assert/strict";
import { createPlanningEngine } from "../src/index.mjs";

test("institutional kernel planning gate marker", () => {
  const report = createPlanningEngine({clock:()=> "2026-07-25T00:00:00.000Z"}).plan({
    tenantId:"tenant_gate",
    cycleId:"cycle_gate",
    reflectionReport:{
      reflectionId:"reflection.gate",
      mode:"advisory",
      mutationAllowed:false,
      summary:{status:"healthy",counts:{total:0}},
      findings:[],
    },
  });
  assert.equal(report.mutationAllowed,false);
  assert.equal(report.approvalAllowed,false);
  assert.equal(report.executionAllowed,false);
  console.log("KERNEL_PLANNING_GATE_OK");
});
