import test from "node:test";
import assert from "node:assert/strict";
import { classifyHostingerNodeArchiveDrift } from "../src/hostinger-node-upstream-drift.mjs";

const current = "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds";
test("classifies removed legacy endpoint and current build contract without allowing execution", () => {
  const report = classifyHostingerNodeArchiveDrift({ paths: {
    [current]: { post: { requestBody: { content: { "application/json": { schema: {
      $ref: "#/components/schemas/Hosting.V1.NodeJs.StartBuildRequest"
    } } } } } }
  } });
  assert.equal(report.status, "legacy-removed-new-contract-review-required");
  assert.equal(report.writesEnabled, false);
  assert.equal(report.productionExecutionAllowed, false);
  assert.equal(report.requiresManualReview, true);
});
test("fails closed for missing upstream operation", () => {
  assert.equal(classifyHostingerNodeArchiveDrift({paths:{}}).status, "contract-unverified-blocked");
});
test("rejects missing upstream evidence", () => {
  assert.throws(() => classifyHostingerNodeArchiveDrift(null), /invalid_openapi/);
});
