import test from "node:test";
import assert from "node:assert/strict";
import { createHostingerNodeContractTransitionReport } from "../src/hostinger-node-contract-transition.mjs";
import { currentOpenApiFixture } from "./fixtures/hostinger-node-build-openapi.mjs";

test("closed Hostinger issue #56 does not lift the migration review gate", () => {
  const report = createHostingerNodeContractTransitionReport({
    openapi: currentOpenApiFixture(),
    issue: { number: 56, state: "closed", updated_at: "2026-09-30T00:00:00Z" },
    observedAt: "2026-10-27T00:00:00Z",
  });

  assert.equal(report.reviewRequired, true);
  assert.equal(report.changeSignals.officialIssueClosed, true);
  assert.equal(report.changeSignals.legacyEndpointMissing, true);
  assert.equal(report.checks.currentBuildOperationPresent, true);
  assert.equal(report.barriers.writesEnabled, false);
  assert.equal(report.barriers.remoteBuildStarted, false);
  assert.equal(report.barriers.productionExecutionAllowed, false);
});
