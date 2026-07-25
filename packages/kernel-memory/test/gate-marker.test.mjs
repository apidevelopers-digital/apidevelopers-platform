import test from "node:test";
import assert from "node:assert/strict";

import { createInstitutionalMemory } from "../src/index.mjs";

test("institutional kernel memory gate marker", () => {
  const memory = createInstitutionalMemory({
    tenantId: "tenant_gate_001",
    clock: () => "2026-07-25T00:00:00.000Z",
  });

  memory.append({
    id: "memory.gate.0001",
    type: "evidence",
    subject: "kernel-memory-gate",
    cycleId: "cycle.gate.0001",
    data: { validated: true },
    recordedBy: "kernel-memory-ci",
  });

  assert.equal(memory.snapshot().mutationAllowed, false);
  assert.equal(memory.verifyIntegrity().valid, true);
  console.log("KERNEL_MEMORY_GATE_OK");
});
