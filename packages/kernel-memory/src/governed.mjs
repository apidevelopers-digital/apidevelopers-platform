import {
  assertMemorySnapshotContract,
  assertTenantContextContract,
  createCognitiveHandoff,
} from "@apidevelopers/contracts";

import { assertMemorySnapshotIntegrity } from "./memory.mjs";

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertKnowledgeSnapshot(snapshot) {
  assertObject(snapshot, "knowledgeSnapshot");
  if (!Array.isArray(snapshot.nodes)) {
    throw new TypeError("knowledgeSnapshot.nodes must be an array");
  }
  if (!Array.isArray(snapshot.relations)) {
    throw new TypeError("knowledgeSnapshot.relations must be an array");
  }
  return snapshot;
}

export function createMemoryReasoningHandoff({
  memory,
  memorySnapshot,
  knowledgeSnapshot,
  tenantContext,
  cycleId,
  handoffId,
  createdAt = new Date().toISOString(),
} = {}) {
  assertTenantContextContract(tenantContext);
  assertString(cycleId, "cycleId");
  assertString(handoffId, "handoffId");

  const snapshot = memorySnapshot ?? memory?.snapshot?.();
  assertMemorySnapshotContract(snapshot);
  assertMemorySnapshotIntegrity(snapshot);
  assertKnowledgeSnapshot(knowledgeSnapshot);

  if (snapshot.tenantId !== tenantContext.tenantId) {
    throw new Error("cross-tenant memory handoff blocked");
  }

  return createCognitiveHandoff({
    handoffId,
    from: "kernel-memory",
    to: "kernel-reasoning",
    cycleId,
    tenantContext,
    payload: {
      memorySnapshot: snapshot,
      knowledgeSnapshot,
    },
    createdAt,
  });
}
