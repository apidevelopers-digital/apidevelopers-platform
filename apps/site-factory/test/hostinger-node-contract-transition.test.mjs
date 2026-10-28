import test from "node:test";
import assert from "node:assert/strict";
import { createHostingerNodeContractTransitionReport } from "../src/hostinger-node-contract-transition.mjs";
import { currentOpenApiFixture } from "./fixtures/hostinger-node-build-openapi.mjs";

const issue = { number: 56, state: "open" };
test("transition preserves manual review gate with full current schema", () => {
  const report = createHostingerNodeContractTransitionReport({
    openapi: currentOpenApiFixture(), issue, observedAt: "2026-10-26T00:00:00Z"
  });
  assert.equal(report.status, "legacy-removed-new-contract-review-required");
  assert.equal(report.reviewRequired, true);
  assert.equal(report.legacyStatus, "review-required");
  assert.equal(report.checks.currentBuildOperationPresent, true);
  assert.equal(report.changeSignals.legacyEndpointMissing, true);
  assert.equal(report.changeSignals.currentArchiveFlowDocumented, true);
  assert.equal(report.barriers.writesEnabled, false);
  assert.equal(report.barriers.buildStartAllowed, false);
  assert.equal(report.barriers.productionExecutionAllowed, false);
  assert.equal(report.barriers.remoteBuildStarted, false);
});
test("transition fails closed when current schema drifts", () => {
  const openapi = currentOpenApiFixture();
  openapi.components.schemas["Hosting.V1.NodeJs.StartBuildRequest"].properties.source_options.properties.archive_path.type = "integer";
  const report = createHostingerNodeContractTransitionReport({
    openapi, issue, observedAt: "2026-10-26T00:00:00Z"
  });
  assert.equal(report.status, "contract-unverified-blocked");
  assert.equal(report.changeSignals.currentArchiveFlowDocumented, false);
  assert.equal(report.barriers.buildStartAllowed, false);
  assert.equal(report.barriers.productionExecutionAllowed, false);
});
test("transition fails closed when neither contract is present", () => {
  const report = createHostingerNodeContractTransitionReport({
    openapi: { paths: {} }, issue, observedAt: "2026-10-26T00:00:00Z"
  });
  assert.equal(report.status, "contract-unverified-blocked");
  assert.equal(report.reviewRequired, true);
  assert.equal(report.barriers.writesEnabled, false);
  assert.equal(report.barriers.buildStartAllowed, false);
});
