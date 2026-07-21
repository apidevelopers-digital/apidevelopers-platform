import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInstitutionalMemory } from "@apidevelopers/kernel-memory";
import { createReflectionEngine } from "@apidevelopers/kernel-reflection";
import { createEvolutionEngine } from "@apidevelopers/kernel-evolution";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function normalizeMemorySource(source) {
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.entries)) return source.entries;
  if (Array.isArray(source?.memory)) return source.memory;
  throw new TypeError("memory source must expose an entries array");
}

function normalizeGraphSource(source) {
  const nodes = source?.nodes ?? source?.graph?.nodes;
  const relations = source?.relations ?? source?.edges ?? source?.graph?.relations ?? source?.graph?.edges;
  if (!Array.isArray(nodes) || !Array.isArray(relations)) {
    throw new TypeError("graph source must expose nodes and relations/edges arrays");
  }
  return { nodes, relations };
}

function normalizeAuditSource(source) {
  const report = source?.report ?? source;
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new TypeError("audit source must expose an object report");
  }
  return report;
}

export async function buildLearningSnapshot({
  memoryEntries,
  graphSnapshot,
  auditReport,
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

  const [memorySource, graphSource, auditSource] = await Promise.all([
    readJson(memoryPath),
    readJson(graphPath),
    readJson(auditPath),
  ]);

  const snapshot = await buildLearningSnapshot({
    memoryEntries: normalizeMemorySource(memorySource),
    graphSnapshot: normalizeGraphSource(graphSource),
    auditReport: normalizeAuditSource(auditSource),
    requestedBy,
    scope,
    clock,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
  return structuredClone(snapshot);
}
