import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInstitutionalMemory } from "@apidevelopers/kernel-memory";
import { createReflectionEngine } from "@apidevelopers/kernel-reflection";
import { createEvolutionEngine } from "@apidevelopers/kernel-evolution";

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return structuredClone(fallback);
    throw error;
  }
}

export async function buildLearningSnapshot({
  memoryEntries = [],
  graphSnapshot = { nodes: [], relations: [] },
  auditReport = { auditId: "portal.learning.no-audit", status: "compliant", checks: [] },
  requestedBy = "portal-learning-worker",
  scope = "platform",
  clock = () => new Date().toISOString(),
} = {}) {
  const memory = createInstitutionalMemory({ clock });
  for (const entry of memoryEntries) memory.append(entry);

  const reflection = createReflectionEngine({ clock }).analyze(graphSnapshot, { requestedBy, scope });
  const evolution = createEvolutionEngine({ clock }).propose(auditReport, { requestedBy, scope });

  const proposals = evolution.proposals.map((proposal) => ({
    ...proposal,
    approvalStatus: "pending_human_review",
    executionStatus: "not_executed",
  }));

  return {
    schemaVersion: "portal.learning-screen/v1",
    generatedAt: clock(),
    readOnly: true,
    summary: {
      memories: memory.snapshot().entryCount,
      findings: reflection.findings.length,
      proposals: proposals.length,
      pendingHumanReview: proposals.length,
    },
    sections: [
      { id: "memory", title: "Memória operacional", items: memory.snapshot().entries },
      { id: "reflection", title: "Achados", items: reflection.findings },
      { id: "evolution", title: "Propostas de melhoria", items: proposals },
    ],
    gates: {
      humanApprovalRequired: true,
      mutationAllowed: false,
      executionAllowed: false,
      automaticApprovalAllowed: false,
    },
  };
}

export async function publishLearningSnapshot({
  memoryPath,
  graphPath,
  auditPath,
  outputPath,
  requestedBy,
  scope,
  clock,
} = {}) {
  if (!memoryPath || !graphPath || !auditPath || !outputPath) {
    throw new TypeError("memoryPath, graphPath, auditPath and outputPath are required");
  }

  const [memoryEntries, graphSnapshot, auditReport] = await Promise.all([
    readJson(memoryPath, []),
    readJson(graphPath, { nodes: [], relations: [] }),
    readJson(auditPath, { auditId: "portal.learning.no-audit", status: "compliant", checks: [] }),
  ]);

  if (!Array.isArray(memoryEntries)) throw new TypeError("memory source must be an array");

  const snapshot = await buildLearningSnapshot({
    memoryEntries, graphSnapshot, auditReport, requestedBy, scope, clock,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
  return structuredClone(snapshot);
}
