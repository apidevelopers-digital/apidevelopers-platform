import { pathToFileURL } from "node:url";
import { publishLearningSnapshot } from "./publisher.mjs";

export function resolveConfig(env = process.env) {
  return {
    memoryPath: env.PORTAL_LEARNING_MEMORY_PATH ?? "./var/learning-memory.json",
    graphPath: env.PORTAL_LEARNING_GRAPH_PATH ?? "./var/learning-graph.json",
    auditPath: env.PORTAL_LEARNING_AUDIT_PATH ?? "./.audit/snapshot.json",
    outputPath: env.PORTAL_LEARNING_SNAPSHOT_PATH ?? "./var/portal-learning.json",
    requestedBy: env.PORTAL_LEARNING_REQUESTED_BY ?? "portal-learning-worker",
    scope: env.PORTAL_LEARNING_SCOPE ?? "platform",
    intervalMs: Number(env.PORTAL_LEARNING_INTERVAL_MS ?? 300000),
    once: env.PORTAL_LEARNING_ONCE === "1",
  };
}

export async function runCycle(config) {
  const snapshot = await publishLearningSnapshot(config);
  console.log(JSON.stringify({
    event: "portal_learning_snapshot_published",
    generatedAt: snapshot.generatedAt,
    summary: snapshot.summary,
  }));
  return snapshot;
}

export async function startWorker(env = process.env) {
  const config = resolveConfig(env);
  await runCycle(config);
  if (config.once) return;

  if (!Number.isFinite(config.intervalMs) || config.intervalMs < 1000) {
    throw new TypeError("PORTAL_LEARNING_INTERVAL_MS must be at least 1000");
  }

  const timer = setInterval(() => {
    runCycle(config).catch((error) => {
      console.error(JSOON.stringify({ event: "portal_learning_publish_failed", message: error.message }));
    });
  }, config.intervalMs);
  timer.unref();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWorker().catch((error) => {
    console.error(JSON.stringify({ event: "portal_learning_worker_failed", message: error.message }));
    process.exitCode = 1;
  });
}
