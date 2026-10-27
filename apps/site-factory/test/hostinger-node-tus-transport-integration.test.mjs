import test from "node:test";
import assert from "node:assert/strict";
import { planHostingerNodeArchiveUpload, assertHostingerNodeWriteAuthorization } from "../src/hostinger-node-tus-plan.mjs";
import { createTusMockTransport, executeTusMockUpload, executeTusRealUpload } from "../src/hostinger-node-tus-transport.mjs";
import { createHostingerNodeContractTransitionReport } from "../src/hostinger-node-contract-transition.mjs";
import { currentOpenApiFixture } from "./fixtures/hostinger-node-build-openapi.mjs";

const target = { username: "dryrun-account", domain: "example.test", archivePath: "artifacts/site-build.zip" };
const startBuildInput = {
  node_version: 22,
  app_type: "vite",
  root_directory: null,
  output_directory: "dist",
  build_script: "build",
  source_type: "archive",
  source_options: { archive_path: target.archivePath },
};
const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

function reviewedPlan() {
  const report = createHostingerNodeContractTransitionReport({
    openapi: currentOpenApiFixture(),
    issue: { number: 56, state: "open" },
    observedAt: "2026-10-26T00:00:00Z",
  });
  assert.equal(report.changeSignals.currentArchiveFlowDocumented, true);
  assert.equal(report.reviewRequired, true);
  assert.equal(report.barriers.productionExecutionAllowed, false);
  const plan = planHostingerNodeArchiveUpload({ ...target, startBuildInput });
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.buildPayloadValidated, true);
  assert.deepEqual(plan.buildRequest.body, startBuildInput);
  assert.equal(plan.buildRequest.body.source_options.archive_path, target.archivePath);
  assert.equal(plan.writesEnabled, false);
  assert.equal(plan.buildStartAllowed, false);
  return plan;
}

test("reviewed Hostinger build plan flows through trusted PATCH transport without remote writes", () => {
  const plan = reviewedPlan();
  assert.equal(plan.tusUploadRequired, true);
  const transport = createTusMockTransport([
    { status: 204, offset: 4 },
    { status: 204, offset: 8 },
    { status: 204, offset: 10 },
  ]);
  const result = executeTusMockUpload({ bytes, chunkSize: 4, transport });
  assert.equal(result.complete, true);
  assert.equal(result.offset, bytes.length);
  assert.equal(result.mode, "mock");
  assert.equal(result.writesEnabled, false);
  assert.deepEqual(result.requests, [
    { offset: 0, length: 4 },
    { offset: 4, length: 4 },
    { offset: 8, length: 2 },
  ]);
  assert.throws(assertHostingerNodeWriteAuthorization, /write_blocked/);
  assert.throws(executeTusRealUpload, /hostinger_tus_write_blocked/);
});

test("failed mock PATCH interrupts journey and resumes only from last acknowledged offset", () => {
  reviewedPlan();
  const interrupted = createTusMockTransport([
    { status: 204, offset: 4 },
    { status: 503, offset: 4 },
  ]);
  assert.throws(
    () => executeTusMockUpload({ bytes, chunkSize: 4, transport: interrupted }),
    /unexpected_tus_status/,
  );
  assert.deepEqual(interrupted.requests, [
    { offset: 0, length: 4 },
    { offset: 4, length: 4 },
  ]);
  // The mocked server acknowledged only the first chunk. No offset is inferred from a failed PATCH.
  const resumed = createTusMockTransport([
    { status: 204,, offset: 8 },
    { status: 204, offset: 10 },
  ]);
  const result = executeTusMockUpload({ bytes, chunkSize: 4, startOffset: 4, transport: resumed });
  assert.equal(result.complete, true);
  assert.equal(result.offset, bytes.length);
  assert.equal(result.writesEnabled, false);
  assert.deepEqual(result.requests, [
    { offset: 4, length: 4 },
    { offset: 8, length: 2 },
  ]);
});

test("different archive path, untrusted transport and wrong recovery offset fail closed", () => {
  assert.throws(() => planHostingerNodeArchiveUpload({
    ...target,
    startBuildInput: { ...startBuildInput, source_options: { archive_path: "artifacts/wrong.zip" } },
  }), /archive_path_mismatch/);
  const unauthorized = { send() { return { status: 204, offset: 4 }; } };
  assert.throws(() => executeTusMockUpload({ bytes, chunkSize: 4, transport: unauthorized }), /tus_transport_not_mock/);
  const wrongOffset = createTusMockTransport([{ status: 204, offset: 5 }]);
  assert.throws(() => executeTusMockUpload({ bytes, chunkSize: 4, transport: wrongOffset }), /tus_offset_mismatch/);
});
