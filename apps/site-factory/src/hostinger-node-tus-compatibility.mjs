import { planHostingerNodeArchiveUpload } from "./hostinger-node-tus-plan.mjs";
import { assertHostingerNodeBuildArchiveContract, HOSTINGER_NODE_BUILD_CONTRACT } from "./hostinger-node-build-contract.mjs";

// Compatibility view only: legacy build execution is never replaced or invoked.
export function inspectHostingerNodeTusMigration({ username, domain, archivePath }) {
  const plan = planHostingerNodeArchiveUpload({ username, domain, archivePath });
  const legacy = assertHostingerNodeBuildArchiveContract({ executionPath: "operator-central-multipart" });
  if (legacy !== HOSTINGER_NODE_BUILD_CONTRACT || !legacy.directRunnerApplyBlocked) {
    throw new Error("legacy_contract_not_safe");
  }
  if (plan.writesEnabled !== false || plan.buildStartAllowed !== false) {
    throw new Error("tus_plan_not_safe");
  }
  return Object.freeze({
    mode: "dry-run",
    writesEnabled: false,
    legacyExecutionPath: legacy.verifiedExecutionPath,
    legacyDirectRunnerBlocked: legacy.directRunnerApplyBlocked,
    tusUploadRequired: plan.tusUploadRequired,
    tusUploadUrlRequest: plan.uploadUrlRequest,
    tusBuildRequest: plan.buildRequest,
    migrationReadyForProduction: false,
    nextAction: "review_consumers_and_monitor_before_executor_changes"
  });
}

export function assertHostingerNodeTusMigrationExecutionAllowed() {
  throw new Error("hostinger_node_tus_migration_execution_blocked:approval_required");
}
