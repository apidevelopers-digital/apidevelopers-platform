import assert from "node:assert/strict";
import test from "node:test";

import {
  HOSTINGER_NODE_BUILD_REQUIRED_TRANSPORT,
  assertHostingerNodeBuildArchiveContract,
} from "../src/hostinger-node-build-contract.mjs";

test("Hostinger Node build apply rejects multipart transport", () => {
  assert.throws(
    () =>
      assertHostingerNodeBuildArchiveContract({
        transport: "multipart",
        archiveRepresentationVerified: true,
      }),
    /hostinger_node_archive_contract_requires_application_json/,
  );
});

test("Hostinger Node build apply fails closed until archive string semantics are verified", () => {
  assert.throws(
    () =>
      assertHostingerNodeBuildArchiveContract({
        transport: "documented-json-filename",
      }),
    /hostinger_node_archive_representation_unverified/,
  );
});

test("verified contract reports application/json transport", () => {
  assert.deepEqual(
    assertHostingerNodeBuildArchiveContract({
      transport: "documented-json-filename",
      archiveRepresentationVerified: true,
    }),
    {
      transport: "documented-json-filename",
      contentType: HOSTINGER_NODE_BUILD_REQUIRED_TRANSPORT,
      archiveRepresentationVerified: true,
    },
  );
});
