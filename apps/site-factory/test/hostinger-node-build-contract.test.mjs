import assert from "node:assert/strict";
import test from "node:test";

import {
  HOSTINGER_NODE_BUILD_CONTRACT,
  assertHostingerNodeBuildArchiveContract,
} from "../src/hostinger-node-build-contract.mjs";

test("Hostinger Node build contract records the verified upstream blocker", () => {
  assert.deepEqual(HOSTINGER_NODE_BUILD_CONTRACT, {
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
});

test("Hostinger Node build apply is fail-closed while upstream issue #56 is open", () => {
  assert.throws(
    () => assertHostingerNodeBuildArchiveContract(),
    /hostinger_node_build_from_archive_upstream_blocked:hostinger\/api#56/,
  );
});

test("Hostinger Node build apply cannot be bypassed with transport hints", () => {
  assert.throws(
    () =>
      assertHostingerNodeBuildArchiveContract({
        transport: "documented-json-filename",
        archiveRepresentationVerified: true,
      }),
    /hostinger_node_build_from_archive_upstream_blocked:hostinger\/api#56/,
  );
});
