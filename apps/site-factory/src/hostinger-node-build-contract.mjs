export const HOSTINGER_NODE_BUILD_CONTRACT = Object.freeze({
  endpoint:
    "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive",
  documentedContentType: "application/json",
  documentedArchiveType: "string",
  observedJsonFailure: "422_archive_must_be_file",
  observedDirectMultipartFailure: "403_cloudflare_managed_challenge",
  observedOperatorCentralMultipartSuccess: "200_build_created",
  verifiedExecutionPath: "operator-central-multipart",
  verifiedBuildId: "01a004dc-2636-71a3-a637-fe2be0261d18",
  verifiedAt: "2026-08-15",
  upstreamIssue: "hostinger/api#56",
  upstreamIssueStatus: "open",
  directRunnerApplyBlocked: true,
  operatorCentralMultipartVerified: true,
});

export function assertHostingerNodeBuildArchiveContract({
  executionPath = "direct-runner",
} = {}) {
  if (
    executionPath === HOSTINGER_NODE_BUILD_CONTRACT.verifiedExecutionPath &&
    HOSTINGER_NODE_BUILD_CONTRACT.operatorCentralMultipartVerified
  ) {
    return HOSTINGER_NODE_BUILD_CONTRACT;
  }

  throw new Error(
    "hostinger_node_build_direct_runner_blocked:use_operator-central-multipart",
  );
}
