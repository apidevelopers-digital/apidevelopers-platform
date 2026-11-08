import test from "node:test";
import assert from "node:assert/strict";
import { planHostingerNodeArchiveUpload as plan } from "../src/hostinger-node-tus-plan.mjs";

const target = { username: "demo", domain: "demo.test", archivePath: "releases/site.tar.gz" };
const startBuildInput = () => ({
  node_version: 22,
  app_type: "vite",
  root_directory: null,
  output_directory: null,
  build_script: null,
  source_type: "archive",
  source_options: { archive_path: target.archivePath }
});

test("nested tar.gz archive is referenced exactly and cannot start a build", () => {
  const preview = plan({ ...target, startBuildInput: startBuildInput() });
  assert.equal(preview.buildPayloadValidated, true);
  assert.equal(preview.buildRequest.body.source_options.archive_path, target.archivePath);
  assert.deepEqual(preview.buildRequest.body, startBuildInput());
  assert.equal(preview.writesEnabled, false);
  assert.equal(preview.buildStartAllowed, false);
});

test("nested tar.gz archive mismatch fails closed", () => {
  assert.throws(
    () => plan({ ...target, startBuildInput: { ...startBuildInput(), source_options: { archive_path: "releases/other.tar.gz" } } }),
    /archive_path_mismatch/
  );
});
