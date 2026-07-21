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

async function atomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

async function run(script, allowFailure = false) {
  try {
    const result = await exec(process.execPath, [at(script)], { cwd: root, maxBuffer: 10_000_000 });
    return { ok: true, stdout: result.stdout };
  } catch (error) {
    if (!allowFailure) throw error;
    return { ok: false, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

async function loadManifests() {
  const dir = at("capabilities");
  const files = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(files.map((name) => readFile(path.join(dir, name), "utf8").then(JSON.parse)));
}

function buildGraph(manifests) {
  const graph = new InstitutionalKnowledgeGraph();
  for (const manifest of manifests) {
    const component = `component.${manifest.id}`;
    const capability = `capability.${manifest.id}`;
    graph.registerNode({ id: component, kind: "component", status: manifest.status ?? "planned" });
    graph.registerNode({ id: capability, kind: "capability", status: manifest.status ?? "planned" });
    graph.relate({ type: "implements", from: component, to: capability });
  }
  return graph.snapshot();
}

function buildMemory(audit) {
  const recordedAt = audit.generatedAt ?? new Date().toISOString();
  const id = String(audit.commit ?? recordedAt).replace(/[^a-zA-Z0-9]+/g, "-");
  return { entries: [{
    id: `memory.${id}.audit`,
    type: "evidence",
    subject: "repository.audit",
    cycleId: `cycle.${id}`,
    status: "observed",
    refs: [".audit/snapshot.json"],
    data: { summary: audit.summary ?? {}, delta: audit.delta ?? {} },
    recordedBy: "portal-learning-integrated-cycle",
    recordedAt,
  }] };
}

function buildAudit(audit, validation) {
  const diagnostics = Array.isArray(validation.diagnostics) ? validation.diagnostics : [];
  return {
    auditId: `audit.portal-learning.${audit.commit ?? "working-tree"}`,
    status: diagnostics.some((item) => item.severity === "error") ? "attention-required" : "compliant",
    checks: diagnostics.map((item, index) => ({
      ruleId: item.code ?? `CAPABILITY_${index + 1}`,
      state: item.severity === "error" ? "fail" : "warn",
      subject: item.capability ?? "capability-registry",
      statement: item.message ?? "Capability validation diagnostic.",
      evidence: [item.source, item.path].filter(Boolean),
    })),
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

  await Promise.all([
    atomic(paths.memory, buildMemory(audit)),
    atomic(paths.graph, buildGraph(manifests)),
    atomic(paths.audit, buildAudit(audit, validation)),
  ]);

  const snapshot = await publishLearningSnapshot({
    memoryPath: paths.memory,
    graphPath: paths.graph,
    auditPath: paths.audit,
    outputPath: paths.snapshot,
  });

  const repository = createJsonLearningSnapshotRepository({ filePath: paths.snapshot });
  const route = createLearningRoute({ repository, adminKey: "local-verifier" });
  const response = await route.handleRequest({
    method: "GET",
    url: "/v1/admin/learning",
    headers: { "x-api-key": "local-verifier" },
  });
  if (response.status !== 200) throw new Error(`endpoint verification failed: ${response.status}`);

  return {
    status: "completed",
    readOnly: true,
    producers,
    sources: { capabilities: manifests.length },
    snapshot: snapshot.summary,
    endpoint: { status: response.status, cacheControl: response.headers["cache-control"] },
    gates: snapshot.gates,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runIntegratedCycle()
    .then((receipt) => console.log(JSON.stringify(receipt, null, 2)))
    .catch((error) => {
      console.error(JSON.stringify({ status: "failed", message: error.message }));
      process.exitCode = 1;
    });
}
