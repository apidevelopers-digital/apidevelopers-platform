import test from "node:test";
import assert from "node:assert/strict";
import { classifyHostingerNodeArchiveDrift } from "../src/hostinger-node-upstream-drift.mjs";
import { currentOpenApiFixture } from "./fixtures/hostinger-node-build-openapi.mjs";

test("classifies current build contract without allowing execution", () => {
  const report = classifyHostingerNodeArchiveDrift(currentOpenApiFixture());
  assert.equal(report.status, "legacy-removed-new-contract-review-required");
  assert.equal(report.writesEnabled, false);
  assert.equal(report.productionExecutionAllowed, false);
  assert.equal(report.requiresManualReview, true);
});
test("fails closed for missing upstream operation", () => {
  assert.equal(classifyHostingerNodeArchiveDrift({ paths: {} }).status, "contract-unverified-blocked");
});
test("rejects missing upstream evidence", () => {
  assert.throws(() => classifyHostingerNodeArchiveDrift(null), /invalid_openapi/);
});
