import { classifyHostingerNodeArchiveDrift } from "./hostinger-node-upstream-drift.mjs";
import { createHostingerNodeContractMonitorReport } from "./hostinger-node-contract-monitor.mjs";

export function createHostingerNodeContractTransitionReport({ openapi, issue, observedAt }) {
  const legacy = createHostingerNodeContractMonitorReport({ openapi, issue, observedAt });
  const transition = classifyHostingerNodeArchiveDrift(openapi);
  const checks = Object.freeze({
    ...legacy.checks,
    currentBuildOperationPresent: Boolean(openapi?.paths?.["/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds"]?.post),
    legacyBuildOperationPresent: transition.legacyAvailable
  });
  return Object.freeze({
    schemaVersion: "1.0",
    kind: "site-factory-hostinger-node-contract-transition",
    status: transition.status,
    reviewRequired: true,
    legacyStatus: legacy.status,
    legacyFingerprint: legacy.fingerprint,
    checks,
    changeSignals: Object.freeze({
      ...legacy.changeSignals,
      legacyEndpointMissing: !transition.legacyAvailable,
      currentArchiveFlowDocumented: transition.newArchiveFlowDocumented
    }),
    barriers: Object.freeze({
      ...legacy.barriers,
      writesEnabled: false,
      remoteBuildStarted: false,
      productionExecutionAllowed: false
    }),
    nextAction: "review_new_contract_and_update_executor_only_after_approval"
  });
}
