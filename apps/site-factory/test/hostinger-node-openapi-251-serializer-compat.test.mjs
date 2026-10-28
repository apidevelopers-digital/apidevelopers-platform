import test from "node:test";
import assert from "node:assert/strict";
import { serializeHostingerNodeStartBuildDryRun } from "../src/hostinger-node-start-build-dry-run.mjs";
import { classifyHostingerNodeArchiveDrift } from "../src/hostinger-node-upstream-drift.mjs";
import {
  HOSTINGER_NODE_BUILD_PATH,
  HOSTINGER_NODE_BUILD_SCHEMA_REF,
  currentOpenApiFixture
} from "./fixtures/hostinger-node-build-openapi.mjs";

// Offline contract snapshot checked against the official Hostinger OpenAPI 2.5.1.
// The live contract monitor separately fetches upstream and stays fail-closed.
function assertMatchesField(field, value) {
  assert.ok(field && typeof field === "object", "undocumented request field");
  if (value === null) {
    assert.equal(field.nullable, true, "null for a non-nullable property");
    return;
  }
  if (field.type === "integer") {
    assert.equal(Number.isInteger(value), true);
  } else {
    assert.equal(typeof value, field.type);
  }
  if (field.enum) assert.ok(field.enum.includes(value), "value outside schema enum");
  if (typeof value === "string") {
    if (field.minLength != null) assert.ok(value.length >= field.minLength);
    if (field.maxLength != null) assert.ok(value.length <= field.maxLength);
  }
}

function assertMatchesStartBuildSchema(schema, body) {
  assert.equal(schema.type, "object");
  for (const field of schema.required) {
    assert.equal(Object.hasOwn(body, field), true, `missing required ${field}`);
  }
  for (const [name, value] of Object.entries(body)) {
    const property = schema.properties[name];
    if (name === "source_options") {
      assert.equal(property.type, "object");
      assert.equal(body.source_type, "archive");
      assert.equal(typeof value, "object");
      assert.equal(Object.hasOwn(value, "archive_path"), true);
      for (const [key, nestedValue] of Object.entries(value)) {
        assertMatchesField(property.properties[key], nestedValue);
      }
    } else {
      assertMatchesField(property, value);
    }
  }
}

test("OpenAPI 2.5.1 archive build snapshot matches the pure serializer in dry-run", () => {
  const openapi = currentOpenApiFixture();
  assert.equal(openapi.info.version, "2.5.1");
  const ref = openapi.paths[HOSTINGER_NODE_BUILD_PATH].post
    .requestBody.content["application/json"].schema.$ref;
  assert.equal(ref, HOSTINGER_NODE_BUILD_SCHEMA_REF);
  const schemaName = ref.replace("#/components/schemas/", "");
  const schema = openapi.components.schemas[schemaName];
  assert.equal(classifyHostingerNodeArchiveDrift(openapi).newArchiveFlowDocumented, true);

  for (const input of [
    {
      node_version: 24, app_type: "vite", root_directory: null,
      output_directory: null, build_script: null, source_type: "archive",
      source_options: { archive_path: "releases/app.tar.gz" },
      entry_file: null, package_manager: "pnpm"
    },
    {
      node_version: 22, app_type: "next", root_directory: "web",
      output_directory: "dist", build_script: "build", source_type: "archive",
      source_options: { archive_path: "uploads/site.zip" },
      entry_file: "server.js", package_manager: "npm"
    }
  ]) {
    const preview = serializeHostingerNodeStartBuildDryRun(input);
    assertMatchesStartBuildSchema(schema, preview.body);
    assert.equal(preview.body.source_options.archive_path, input.source_options.archive_path);
    for (const flag of ["writesEnabled", "remoteBuildStarted", "productionExecutionAllowed"]) {
      assert.equal(preview[flag], false);
    }
  }
});

test("schema drift cannot be mistaken for compatible serialized output", () => {
  const openapi = currentOpenApiFixture();
  const schema = openapi.components.schemas["Hosting.V1.NodeJs.StartBuildRequest"];
  const body = serializeHostingerNodeStartBuildDryRun({
    node_version: 22, app_type: "vite", root_directory: "web",
    output_directory: "dist", build_script: "build", source_type: "archive",
    source_options: { archive_path: "releases/site.zip" }
  }).body;
  schema.properties.app_type.enum = ["other"];
  assert.throws(() => assertMatchesStartBuildSchema(schema, body), /schema enum/);
  assert.equal(classifyHostingerNodeArchiveDrift(openapi).newArchiveFlowDocumented, false);
});
