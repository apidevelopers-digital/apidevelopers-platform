import test from "node:test";
import assert from "node:assert/strict";
import { classifyHostingerNodeArchiveDrift } from "../src/hostinger-node-upstream-drift.mjs";
import { currentOpenApiFixture, HOSTINGER_NODE_BUILD_PATH } from "./fixtures/hostinger-node-build-openapi.mjs";

const legacy = `${HOSTINGER_NODE_BUILD_PATH}/from-archive`;

test("recognizes complete current StartBuildRequest in dry-run only", () => {
  const report = classifyHostingerNodeArchiveDrift(currentOpenApiFixture());
  assert.equal(report.status, "legacy-removed-new-contract-review-required");
  assert.equal(report.newArchiveFlowDocumented, true);
  assert.equal(report.requiresManualReview, true);
  assert.equal(report.writesEnabled, false);
  assert.equal(report.productionExecutionAllowed, false);
});

test("missing referenced schema, wrong namespace and unknown reference fail closed", () => {
  const noSchema = currentOpenApiFixture();
  delete noSchema.components.schemas["Hosting.V1.NodeJs.StartBuildRequest"];
  const badNamespace = currentOpenApiFixture();
  badNamespace.paths[HOSTINGER_NODE_BUILD_PATH].post.requestBody.content["application/json"].schema.$ref =
    "#/components/schemas/Hostinger.V1.NodeJs.StartBuildRequest";
  const unknown = currentOpenApiFixture();
  unknown.paths[HOSTINGER_NODE_BUILD_PATH].post.requestBody.content["application/json"].schema.$ref =
    "#/components/schemas/Unknown";
  for (const openapi of [noSchema, badNamespace, unknown]) {
    const report = classifyHostingerNodeArchiveDrift(openapi);
    assert.equal(report.status, "contract-unverified-blocked");
    assert.equal(report.newArchiveFlowDocumented, false);
    assert.equal(report.productionExecutionAllowed, false);
  }
});

test("changed required, field types, enums or archive_path fail closed", () => {
  const mutations = [
    (s) => { s.required.pop(); },
    (s) => { s.required.push("new_mandatory_field"); },
    (s) => { s.properties.node_version.enum.push(26); },
    (s) => { s.properties.source_type.enum = ["git"]; },
    (s) => { s.properties.root_directory.maxLength = 50; },
    (s) => { s.properties.build_script.nullable = false; },
    (s) => { s.properties.app_type.enum.pop(); },
    (s) => { s.properties.source_options.type = "string"; },
    (s) => { delete s.properties.source_options.properties.archive_path; },
    (s) => { s.properties.source_options.properties.archive_path.type = "integer"; },
    (s) => { s.properties.source_options.required = ["owner"]; },
    (s) => { s.properties.package_manager.enum.push("bun"); }
  ];
  for (const mutate of mutations) {
    const openapi = currentOpenApiFixture();
    mutate(openapi.components.schemas["Hosting.V1.NodeJs.StartBuildRequest"]);
    const report = classifyHostingerNodeArchiveDrift(openapi);
    assert.equal(report.status, "contract-unverified-blocked", mutate.toString());
    assert.equal(report.newArchiveFlowDocumented, false);
    assert.equal(report.writesEnabled, false);
  }
});

test("legacy operation is still reported for mandatory manual review", () => {
  const report = classifyHostingerNodeArchiveDrift({ paths: { [legacy]: { post: {} } } });
  assert.equal(report.status, "legacy-present-review-required");
  assert.equal(report.productionExecutionAllowed, false);
});
