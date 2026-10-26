import test from "node:test";
import assert from "node:assert/strict";
import { createHostingerNodeContractTransitionReport } from "../src/hostinger-node-contract-transition.mjs";

const path = "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds";
const issue = { number: 56, state: "open" };
test("transition preserves legacy review gate when old endpoint is removed", () => {
  const report = createHostingerNodeContractTransitionReport({
    openapi: { openapi: "3.0.0", info: { version: "2.2.0" }, paths: {
      [path]: { post: { requestBody: { content: { "application/json": {
        schema: { $ref: "#/components/schemas/Hostinger.V1.NodeJs.StartBuildRequest" }
      } } } } }
    } },
    issue, observedAt: "2026-10-26T00:00:00Z"
  });
  assert.equal(report.reviewRequired, true);
  assert.equal(report.legacyStatus, "review-required");
  assert.equal(report.checks.currentBuildOperationPresent, true);
  assert.equal(report.changeSignals.legacyEndpointMissing, true);
  assert.equal(report.barriers.writesEnabled, false);
  assert.equal(report.barriers.productionExecutionAllowed, false);
  assert.equal(report.barriers.remoteBuildStarted, false);
});
test("transition fails closed when neither contract is present", () => {
  const report = createHostingerNodeContractTransitionReport({
    openapi: { paths: {} }, issue, observedAt: "2026-10-26T00:00:00Z"
  });
  assert.equal(report.status, "contract-unverified-blocked");
  assert.equal(report.reviewRequired, true);
  assert.equal(report.barriers.writesEnabled, false);
});
