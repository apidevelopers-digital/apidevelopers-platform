import assert from "node:assert/strict";
import test from "node:test";

import {
  HOSTINGER_NODE_BUILD_CONTRACT,
  assertHostingerNodeBuildArchiveContract,
} from "../src/hostinger-node-build-contract.mjs";

test("Hostinger Node build contract records verified operator-central multipart path", () => {
  assert.deepEqual(HOSTINGER_NODE_BUILD_CONTRACT, {
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
});

test("direct runner remains fail-closed", () => {
  assert.throws(
    () => assertHostingerNodeBuildArchiveContract(),
    /hostinger_node_build_direct_runner_blocked:use_operator-central-multipart/,
  );
});

test("verified operator-central multipart path is allowed by the contract", () => {
  assert.equal(
    assertHostingerNodeBuildArchiveContract({
      executionPath: "operator-central-multipart",
    }),
    HOSTINGER_NODE_BUILD_CONTRACT,
  );
});

test("unverified transport hints cannot bypass the direct-runner block", () => {
  assert.throws(
    () =>
      assertHostingerNodeBuildArchiveContract({
        executionPath: "multipart",
        transport: "multipart",
      }),
    /hostinger_node_build_direct_runner_blocked:use_operator-central-multipart/,
  );
});
