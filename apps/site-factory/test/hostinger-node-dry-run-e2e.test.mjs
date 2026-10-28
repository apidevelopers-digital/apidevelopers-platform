import test from "node:test";
import assert from "node:assert/strict";
import { planHostingerNodeArchiveUpload, assertHostingerNodeWriteAuthorization } from "../src/hostinger-node-tus-plan.mjs";
import { simulateTusChunks } from "../src/hostinger-node-tus-simulator.mjs";
import { createHostingerNodeContractTransitionReport } from "../src/hostinger-node-contract-transition.mjs";
import { currentOpenApiFixture } from "./fixtures/hostinger-node-build-openapi.mjs";

const target = { username: "dryrun-account", domain: "example.test", archivePath: "artifacts/site-build.zip" };
const startBuildInput = {
  node_version: 22, app_type: "vite", root_directory: null,
  output_directory: "dist", build_script: "build", source_type: "archive",
  source_options: { archive_path: target.archivePath },
};

test("official schema fixture -> TUS chunks -> matching build body remains dry-run", () => {
  const contract = createHostingerNodeContractTransitionReport({
    openapi: currentOpenApiFixture(), issue: { number: 56, state: "open" },
    observedAt: "2026-10-26T00:00:00Z",
  });
  assert.equal(contract.changeSignals.currentArchiveFlowDocumented, true);
  assert.equal(contract.reviewRequired, true);
  assert.equal(contract.barriers.productionExecutionAllowed, false);

  const plan = planHostingerNodeArchiveUpload({ ...target, startBuildInput });
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.buildPayloadValidated, true);
  assert.deepEqual(plan.buildRequest.body, startBuildInput);
  assert.equal(plan.buildRequest.body.source_options.archive_path, target.archivePath);
  assert.equal(plan.tusUploadRequired, true);
  assert.equal(plan.buildStartAllowed, false);
  assert.equal(plan.writesEnabled, false);

  const result = simulateTusChunks({
    bytes: Uint8Array.from([1, 2, 3, 4, 5, 6, 7]),
    chunkSize: 3,
    responses: [
      { status: 204, offset: 3 },
      { status: 204, offset: 6 },
      { status: 204, offset: 7 },
    ],
  });
  assert.equal(result.complete, true);
  assert.equal(result.offset, 7);
  assert.equal(result.writesEnabled, false);
  assert.throws(assertHostingerNodeWriteAuthorization, /write_blocked/);
});

test("mismatched archive and invalid TUS offset cannot complete the simulated journey", () => {
  assert.throws(() => planHostingerNodeArchiveUpload({
    ...target,
    startBuildInput: {
      ...startBuildInput,
      source_options: { archive_path: "artifacts/wrong.zip" },
    },
  }), /archive_path_mismatch/);
  assert.throws(() => simulateTusChunks({
    bytes: Uint8Array.from([1, 2, 3]), chunkSize: 3,
    responses: [{ status: 204, offset: 2 }],
  }), /tus_offset_mismatch/);
});
