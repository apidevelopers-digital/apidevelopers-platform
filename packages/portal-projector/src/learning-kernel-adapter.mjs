import { buildLearningFacade } from "./learning-facade.mjs";

function assertMethod(target, method, name) {
  if (!target || typeof target[method] !== "function") {
    throw new TypeError(`${name}.${method} must be a function`);
  }
}

function normalizeAuditReport(auditReport) {
  if (auditReport) return structuredClone(auditReport);
  return {
    auditId: "portal.learning.no-audit",
    status: "compliant",
    checks: [],
  };
}

export function projectKernelLearning({
  memory,
  reflectionEngine,
  evolutionEngine,
  graphSnapshot = { nodes: [], relations: [] },
  auditReport = null,
  requestedBy = "portal",
  scope = "platform",
  generatedAt = null,
} = {}) {
  assertMethod(memory, "snapshot", "memory");
  assertMethod(reflectionEngine, "analyze", "reflectionEngine");
  assertMethod(evolutionEngine, "propose", "evolutionEngine");

  const memorySnapshot = memory.snapshot();
  const reflectionReport = reflectionEngine.analyze(structuredClone(graphSnapshot), {
    requestedBy,
    scope,
  });
  const evolutionReport = evolutionEngine.propose(normalizeAuditReport(auditReport), {
    requestedBy,
    scope,
  });

  const facade = buildLearningFacade({
    memories: memorySnapshot.entries ?? [],
    reflections: reflectionReport.findings ?? [],
    evolutionProposals: evolutionReport.proposals ?? [],
    generatedAt,
  });

  return Object.freeze({
    ...facade,
    source: Object.freeze({
      memory: Object.freeze({
        mode: memorySnapshot.mode ?? "append-only",
        mutationAllowed: memorySnapshot.mutationAllowed ?? false,
        entryCount: memorySnapshot.entryCount ?? facade.memory.length,
      }),
      reflection: Object.freeze({
        reflectionId: reflectionReport.reflectionId ?? null,
        mode: reflectionReport.mode ?? "advisory",
        status: reflectionReport.summary?.status ?? "unknown",
        findingCount: reflectionReport.findings?.length ?? 0,
      }),
      evolution: Object.freeze({
        evolutionId: evolutionReport.evolutionId ?? null,
        mode: evolutionReport.mode ?? "advisory",
        status: evolutionReport.status ?? "stable",
        proposalCount: evolutionReport.proposals?.length ?? 0,
      }),
    }),
  });
}

export function buildLearningScreenModel(projection) {
  if (!projection || typeof projection !== "object") {
    throw new TypeError("projection must be an object");
  }

  const memory = Array.isArray(projection.memory) ? projection.memory : [];
  const reflection = Array.isArray(projection.reflection) ? projection.reflection : [];
  const evolution = Array.isArray(projection.evolution) ? projection.evolution : [];

  return Object.freeze({
    screenId: "portal.learning",
    title: "Memória e melhorias",
    readOnly: true,
    summary: Object.freeze({
      memories: memory.length,
      findings: reflection.length,
      proposals: evolution.length,
      pendingHumanReview: evolution.filter(
        (item) => item.approvalStatus === "pending_human_review",
      ).length,
    }),
    sections: Object.freeze([
      Object.freeze({ id: "memory", title: "Memória operacional", items: memory }),
      Object.freeze({ id: "reflection", title: "Achados", items: reflection }),
      Object.freeze({ id: "evolution", title: "Propostas de melhoria", items: evolution }),
    ]),
    gates: projection.gates,
  });
}
