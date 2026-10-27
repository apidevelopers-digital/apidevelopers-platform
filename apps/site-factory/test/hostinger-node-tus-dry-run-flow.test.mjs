import test from "node:test";
import assert from "node:assert/strict";
import { runHostingerNodeArchiveDryRun } from "../src/hostinger-node-tus-dry-run-flow.mjs";
import { currentOpenApiFixture } from "./fixtures/hostinger-node-build-openapi.mjs";

const input = {
  openapi: currentOpenApiFixture(),
  issue: { number: 56, state: "open" },
  observedAt: "2026-10-26T00:00:00Z",
  username: "dryrun-account",
  domain: "example.test",
  archivePath: "artifacts/site-build.zip",
  startBuildInput: {
    node_version: 22,
    app_type: "vite",
    root_directory: null,
    output_directory: "dist",
    build_script: "build",
    source_type: "archive",
    source_options: { archive_path: "artifacts/site-build.zip" },
  },
  bytes: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
  chunkSize: 4,
};

test("single dry-run entrypoint validates contract, planned build and mocked transport", () => {
  const flow = runHostingerNodeArchiveDryRun({
    ...input, responses: [{ status: 204, offset: 4 }, { status: 204, offset: 8 }],
  });
  assert.equal(flow.mode, "dry-run");
  assert.equal(flow.reviewRequired, true);
  assert.equal(flow.plan.buildPayloadValidated, true);
  assert.equal(flow.plan.buildRequest.body.source_options.archive_path, input.archivePath);
  assert.equal(flow.transfer.complete, true);
  assert.deepEqual(flow.transfer.requests, [{ offset: 0, length: 4 }, { offset: 4, length: 4 }]);
  assert.deepEqual([flow.writesEnabled, flow.buildStartAllowed, flow.remoteBuildStarted, flow.productionExecutionAllowed], [false, false, false, false]);
});

test("entrypoint resumes acknowledged chunks, without remote writes", () => {
  const flow = runHostingerNodeArchiveDryRun({
    ...input, startOffset: 4, responses: [{ status: 204, offset: 8 }],
  });
  assert.equal(flow.transfer.offset, 8);
  assert.deepEqual(flow.transfer.requests, [{ offset: 4, length: 4 }]);
  assert.equal(flow7ritesEnabled, false);
});

test("entrypoint blocks contract drift, wrong archive and failed mock transfer", () => {
  const drift = currentOpenApiFixture();
  delete drift.components.schemas["Hosting.V1.NodeJs.StartBuildRequest"];
  assert.throws(() => runHostingerNodeArchiveDryRun({ ...input, openapi: drift, responses: [] }), /contract_unverified/);
  assert.throws(() => runHostingerNodeArchiveDryRun({
    ...input,
    startBuildInput: { ...input.startBuildInput, source_options: { archive_path: "wrong.zip" } },
    responses: [],
  }), /archive_path_mismatch/);
  assert.throws(() => runHostingerNodeArchiveDryRun({
    ...input,
    responses: [{ status: 204, offset: 4 }, { status: 503, offset: 4 }],
  }), /unexpected_tus_status/);
  assert.throws(() => runHostingerNodeArchiveDryRun({
    ...input, bytes: new Uint8Array(), responses: [],
  }), /invalid_archive_bytes/);
});
