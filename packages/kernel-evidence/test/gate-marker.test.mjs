import test from "node:test";
import assert from "node:assert/strict";
import { createEvidenceRegistry, verifyEvidence } from "../src/index.mjs";

test("institutional kernel evidence gate marker", () => {
  const record = createEvidenceRegistry({
    clock: () => "2026-07-26T05:00:00.000Z",
  }).record({
    evidenceId: "evidence.marker",
    tenantId: "tenant_alpha",
    cycleId: "cycle_1",
    type: "test",
    source: { component: "kernel-evidence-ci" },
    payload: { marker: true },
  });
  assert.equal(verifyEvidence(record), true);
  console.log("KERNEL_EVIDENCE_GATE_OK");
});
