import { createHostingerNodeContractMonitorReport } from "./hostinger-node-contract-monitor.mjs";
import { inspectHostingerNodeTusMigration } from "./hostinger-node-tus-compatibility.mjs";

export function createHostingerNodeTusMonitorReport({ openapi, issue, username, domain, archivePath, observedAt }) {
  const legacy = createHostingerNodeContractMonitorReport({ openapi, issue, observedAt });
  const tus = inspectHostingerNodeTusMigration({ username, domain, archivePath });
  if (tus.mode !== "dry-run" || tus.writesEnabled !== false || tus.migrationReadyForProduction !== false) {
    throw new Error("tus_monitor_execution_boundary_violated");
  }
  return Object.freeze({
    ...legacy,
    tusMigration: Object.freeze({
      status: "dry-run-blocked",
      writesEnabled: false,
      migrationReadyForProduction: false,
      legacyExecutionPath: tus.legacyExecutionPath,
      nextAction: tus.nextAction
    }),
    barriers: Object.freeze({ ...legacy.barriers, tusMigrationExecutionBlocked: true })
  });
}
