import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { InstitutionalKnowledgeGraph } from "../../../scripts/lib/institutional-knowledge-graph.mjs";
import { publishLearningSnapshot } from "./publisher.mjs";
import { createJsonLearningSnapshotRepository } from "../../api-gateway/src/learning-snapshot-repository.mjs";
import { createLearningRoute } from "../../api-gateway/src/learning-route.mjs";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (value) => path.resolve(root, value);

const paths = {
  memory: at(process.env.PORTAL_LEARNING_MEMORY_PATH ?? "var/learning-memory.json"),
  graph: at(process.env.PORTAL_LEARNING_GRAPH_PATH ?? "var/learning-graph.json"),
  audit: at(process.env.PORTAL_LEARNING_AUDIT_PATH ?? "var/learning-audit.json"),
  snapshot: at(process.env.PORTAL_LEARNING_SNAPSHOT_PATH ?? "var/portal-learning.json"),
};

function canonicalSegment(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return normalized || "unknown";
}

async function atomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

async function run(script, allowFailure = false) {
  try {
    const result = await exec(process.execPath, [at(script)], {
      cwd: root,
      maxBuffer: 10_000_000,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    if (!allowFailure) throw error;
    return {
      ok: false,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      exitCode: Number(error.code ?? 1),
    };
  }
}

async function loadManifests() {
  const dir = at("capabilities");
  const files = (await readdir(dir))
    .filter((name) => name.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map((name) =>
      readFile(path.join(dir, name), "utf8").then(JSON.parse),
    ),
  );
}

export function buildGraph(manifests) {
  const graph = new InstitutionalKnowledgeGraph();

  for (const manifest of manifests) {
    const id = canonicalSegment(manifest.id);
    const solution = `solution.${id}`;
    const capability = `capability.${id}`;

    graph.registerNode({
      id: solution,
      kind: "solution",
      status: manifest.status ?? "planned",
      metadata: { source: `capabilities/${manifest.id}.json` },
    });
    graph.registerNode({
      id: capability,
      kind: "capability",
      status: manifest.status ?? "planned",
      metadata: { displayName: manifest.displayName ?? manifest.id },
    });
    graph.relate({
      type: "implements",
      from: solution,
      to: capability,
      metadata: { source: "capability-manifest" },
    });
  }

  return graph.snapshot();
}

function buildMemory(audit) {
  const recordedAt = audit.generatedAt ?? new Date().toISOString();
  const token = canonicalSegment(audit.commit ?? recordedAt);
  return {
    entries: [{
      id: `memory.${token}.audit`,
      type: "evidence",
      subject: "repository.audit",
      cycleId: `cycle.${token}`,
      status: "observed",
      refs: [".audit/snapshot.json"],
      data: {
        summary: audit.summary ?? {},
        delta: audit.delta ?? {},
      },
      recordedBy: "portal-learning-integrated-cycle",
      recordedAt,
    }],
  };
}

function buildAudit(audit, validation) {
  const diagnostics = Array.isArray(validation.diagnostics)
    ? validation.diagnostics
    : [];

  const checks = diagnostics.map((item, index) => {
    const severity = String(item.severity ?? "").toLowerCase();
    const state = ["error", "critical"].includes(severity)
      ? "fail"
      : severity === "warning"
        ? "warn"
        : "pass";

    return {
      ruleId: item.code ?? `CAPABILITY_${index + 1}`,
      state,
      subject: item.capability ?? item.subject ?? "capability-registry",
      statement: item.message ?? "Capability validation diagnostic.",
      recommendation: item.recommendation ?? null,
      evidence: [item.source, item.path].filter(Boolean),
    };
  });

  if (checks.length === 0) {
    checks.push({
      ruleId: "CAPABILITY_REGISTRY_VALID",
      state: "pass",
      subject: "capability-registry",
      statement: "Capability registry validation produced no diagnostics.",
      recommendation: null,
      evidence: ["generated/capabilities.validation.json"],
    });
  }

  const hasFailure = checks.some((check) => check.state === "fail");
  const hasWarning = checks.some((check) => check.state === "warn");

  return {
    auditId: `audit.portal-learning.${canonicalSegment(audit.commit ?? "working-tree")}`,
    status: hasFailure
      ? "attention-required"
      : hasWarning
        ? "review"
        : "compliant",
    generatedAt: audit.generatedAt ?? validation.generatedAt ?? null,
    sourceCommit: audit.commit ?? null,
    checks,
  };
}

export async function runIntegratedCycle() {
  const producers = {
    audit: await run("scripts/institutional-audit/audit.mjs"),
    validation: await run("scripts/check-capability-registry.mjs", true),
  };

  const [audit, validation, manifests] = await Promise.all([
    readFile(at(".audit/snapshot.json"), "utf8").then(JSON.parse),
    readFile(at("generated/capabilities.validation.json"), "utf8").then(JSON.parse),
    loadManifests(),
  ]);

  const memory = buildMemory(audit);
  const graph = buildGraph(manifests);
  const evolutionAudit = buildAudit(audit, validation);

  await Promise.all([
    atomic(paths.memory, memory),
    atomic(paths.graph, graph),
    atomic(paths.audit, evolutionAudit),
  ]);

  const snapshot = await publishLearningSnapshot({
    memoryPath: paths.memory,
    graphPath: paths.graph,
    auditPath: paths.audit,
    outputPath: paths.snapshot,
  });

  const repository = createJsonLearningSnapshotRepository({
    filePath: paths.snapshot,
  });
  const route = createLearningRoute({
    repository,
    adminKey: "local-verifier",
  });
  const response = await route.handleRequest({
    method: "GET",
    url: "/v1/admin/learning",
    headers: { "x-api-key": "local-verifier" },
  });

  if (response.status !== 200) {
    throw new Error(`endpoint verification failed: ${response.status}`);
  }

  return {
    status: "completed",
    readOnly: true,
    producers,
    sources: {
      capabilities: manifests.length,
      memories: memory.entries.length,
      graphNodes: graph.nodes.length,
      graphRelations: graph.relations.length,
      auditChecks: evolutionAudit.checks.length,
    },
    snapshot: snapshot.summary,
    endpoint: {
      status: response.status,
      cacheControl: response.headers["cache-control"],
    },
    gates: snapshot.gates,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runIntegratedCycle()
    .then((receipt) => console.log(JSON.stringify(receipt, null, 2)))
    .catch((error) => {
      console.error(JSON.stringify({
        status: "failed",
        message: error.message,
      }));
      process.exitCode = 1;
    });
}
