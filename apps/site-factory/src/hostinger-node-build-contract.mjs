export const HOSTINGER_NODE_BUILD_CONTRACT = Object.freeze({
  endpoint:
    "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive",
  documentedContentType: "application/json",
  documentedArchiveType: "string",
  observedJsonFailure: "422_archive_must_be_file",
  observedMultipartFailure: "403_cloudflare_managed_challenge",
  upstreamIssue: "hostinger/api#56",
  upstreamIssueStatus: "open",
  applyBlocked: true,
});

export function assertHostingerNodeBuildArchiveContract() {
  throw new Error(
    "hostinger_node_build_from_archive_upstream_blocked:hostinger/api#56",
  );
}
