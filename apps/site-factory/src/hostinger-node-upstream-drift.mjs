// Read-only classification of upstream Node archive contract drift.
export function classifyHostingerNodeArchiveDrift(openapi) {
  if (!openapi || typeof openapi !== "object") throw new Error("invalid_openapi");
  const legacyPath = "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive";
  const currentPath = "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds";
  const legacyAvailable = Boolean(openapi.paths?.[legacyPath]?.post);
  const currentOperation = openapi.paths?.[currentPath]?.post;
  const newArchiveFlowDocumented = currentOperation?.requestBody?.content?.["application/json"]?.schema?.$ref ===
    "#/components/schemas/Hosting.V1.NodeJs.StartBuildRequest";
  return Object.freeze({
    status: legacyAvailable ? "legacy-present-review-required" :
      newArchiveFlowDocumented ? "legacy-removed-new-contract-review-required" : "contract-unverified-blocked",
    legacyAvailable,
    newArchiveFlowDocumented,
    writesEnabled: false,
    productionExecutionAllowed: false,
    requiresManualReview: true,
    nextAction: "review_new_contract_and_migrate_planner_without_real_execution"
  });
}
