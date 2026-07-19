import {
  assertMemorySnapshotContract,
  assertTenantContextContract,
  createCognitiveHandoff,
} from "@apidevelopers/contracts";

function assertKnowledgeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("knowledgeSnapshot must be an object");
  }
  if (!Array.isArray(snapshot.nodes)) {
    throw new Error("knowledgeSnapshot.nodes must be an array");
  }
  if (!Array.isArray(snapshot.relations)) {
    throw new Error("knowledgeSnapshot.relations must be an array");
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
  const snapshot = memorySnapshot ?? memory?.snapshot?.();

  assertMemorySnapshotContract(snapshot);
  assertKnowledgeSnapshot(knowledgeSnapshot);
  assertTenantContextContract(tenantContext);

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
