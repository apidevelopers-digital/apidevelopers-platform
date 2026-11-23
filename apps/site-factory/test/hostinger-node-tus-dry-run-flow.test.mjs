import test from "node:test";
import assert from "node:assert/strict";
import { runHostingerNodeArchiveDryRun as run } from "../src/hostinger-node-tus-dry-run-flow.mjs";
import { currentOpenApiFixture } from "./fixtures/hostinger-node-build-openapi.mjs";

const input = {
  openapi: currentOpenApiFixture(), issue: { number: 56, state: "open" },
  observedAt: "2026-10-26T00:00:00Z", username: "dryrun-account",
  domain: "example.test", archivePath: "artifacts/site.zip",
  startBuildInput: {
    node_version: 22, app_type: "vite", root_directory: null,
    output_directory: "dist", build_script: "build", source_type: "archive",
    source_options: { archive_path: "artifacts/site.zip" },
  },
  bytes: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), chunkSize: 4,
};

test("full mock transfer validates build body and preserves execution barriers", () => {
  const result = run({ ...input, responses: [{ status: 204, offset: 4 }, { status: 204, offset: 8 }] });
  assert.equal(result.plan.buildPayloadValidated, true);
  assert.equal(result.plan.buildRequest.body.source_options.archive_path, input.archivePath);
  assert.equal(result.transfer.complete, true);
  assert.deepEqual(result.transfer.requests, [{ offset: 0, length: 4 }, { offset: 4, length: 4 }]);
  assert.deepEqual([result.writesEnabled, result.buildStartAllowed, result.remoteBuildStarted, result.productionExecutionAllowed], [false, false, false, false]);
  assert.equal(result.reviewRequired, true);
});

test("resume from the acknowledged offset stays mock-only", () => {
  const result = run({ ...input, startOffset: 4, responses: [{ status: 204, offset: 8 }] });
  assert.deepEqual(result.transfer.requests, [{ offset: 4, length: 4 }]);
  assert.equal(result.transfer.writesEnabled, false);
});

test("drift, path mismatch, empty archive and transport failure block the flow", () => {
  const drift = currentOpenApiFixture();
  delete drift.components.schemas["Hosting.V1.NodeJs.StartBuildRequest"];
  assert.throws(() => run({ ...input, openapi: drift, responses: [] }), /contract_unverified/);
  assert.throws(() => run({ ...input, startBuildInput: {
    ...input.startBuildInput, source_options: { archive_path: "wrong.zip" },
  }, responses: [] }), /archive_path_mismatch/);
  assert.throws(() => run({ ...input, bytes: new Uint8Array(), responses: [] }), /invalid_archive_bytes/);
  assert.throws(() => run({ ...input, responses: [
    { status: 204, offset: 4 }, { status: 503, offset: 4 },
  ] }), /unexpected_tus_status/);
});
