import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPECTED,
  createHostingerNodeContractMonitorReport,
} from "../src/hostinger-node-contract-monitor.mjs";

const schemaRef = (name) => ({ $ref: `#/components/schemas/${name}` });
const BUILD_FIELDS = [
  "node_version",
  "app_type",
  "root_directory",
  "output_directory",
  "build_script",
  "source_type",
  "source_options",
];

function fixture() {
  const openapi = {
    openapi: EXPECTED.openapiVersion,
    info: { version: EXPECTED.apiVersion },
    paths: {
      [EXPECTED.uploadEndpoint]: {
        post: {
          operationId: EXPECTED.uploadOperationId,
          requestBody: {
            required: true,
            content: { "application/json": { schema: schemaRef(EXPECTED.uploadSchema) } },
          },
        },
      },
      [EXPECTED.buildEndpoint]: {
        post: {
          operationId: EXPECTED.buildOperationId,
          requestBody: {
            required: true,
            content: { "application/json": { schema: schemaRef(EXPECTED.buildSchema) } },
          },
        },
      },
      [EXPECTED.settingsEndpoint]: {
        get: {
          operationId: EXPECTED.settingsOperationId,
          parameters: [
            {
              name: "archive_path",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
        },
      },
    },
    components: {
      schemas: {
        [EXPECTED.uploadSchema]: {
          type: "object",
          required: ["username", "domain"],
          properties: {
            username: { type: "string" },
            domain: { type: "string" },
          },
        },
        [EXPECTED.buildSchema]: {
          required: [...BUILD_FIELDS],
          properties: {
            source_type: { type: "string", enum: ["archive"] },
            source_options: {
              properties: { archive_path: { type: "string" } },
            },
          },
        },
      },
    },
  };
  const issue = {
    number: 56,
    state: "closed",
    html_url: "https://github.com/hostinger/api/issues/56",
  };
  return { openapi, issue };
}

function run({ openapi, issue } = fixture()) {
  return createHostingerNodeContractMonitorReport({
    openapi,
    issue,
    observedAt: "2026-10-16T12:00:00Z",
  });
}

test("official archive flow unchanged; deployment stays blocked", () => {
  const first = run();
  const second = run();
  assert.equal(first.status, "unchanged-blocked");
  assert.equal(first.reviewRequired, false);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(Object.values(first.barriers).filter(Boolean), []);
});

test("global API metadata drift is informative, not a contract change", () => {
  const input = fixture();
  input.openapi.info.version = "2.2.0";
  assert.equal(run(input).status, "upstream-metadata-changed-blocked");
});

test("missing upload operation requires review", () => {
  const input = fixture();
  delete input.openapi.paths[EXPECTED.uploadEndpoint];
  const report = run(input);
  assert.equal(report.checks.uploadOperationIdMatches, false);
  assert.equal(report.reviewRequired, true);
});

test("return of legacy endpoint requires review", () => {
  const input = fixture();
  input.openapi.paths[EXPECTED.legacyEndpoint] = { post: {} };
  const report = run(input);
  assert.equal(report.checks.legacyEndpointAbsent, false);
  assert.equal(report.reviewRequired, true);
});

test("changed upload schema and build operation require review", () => {
  const input = fixture();
  input.openapi.paths[EXPECTED.uploadEndpoint].post
    .requestBody.content["application/json"].schema.$ref = "#/invalid";
  input.openapi.paths[EXPECTED.buildEndpoint].post.operationId = "changed";
  assert.equal(run(input).reviewRequired, true);
});

test("missing required build field and invalid archive path require review", () => {
  const input = fixture();
  const schema = input.openapi.components.schemas[EXPECTED.buildSchema];
  schema.required.pop();
  schema.properties.source_options.properties.archive_path.type = "number";
  const report = run(input);
  assert.equal(report.checks.archivePathIsString, false);
  assert.equal(report.checks.buildRequiredFieldsMatch, false);
  assert.equal(report.reviewRequired, true);
});

test("additional required build field triggers fail-closed review", () => {
  const input = fixture();
  input.openapi.components.schemas[EXPECTED.buildSchema].required.push("new_required_field");
  const report = run(input);
  assert.equal(report.checks.buildRequiredFieldsMatch, false);
  assert.equal(report.reviewRequired, true);
});

test("additional required upload field triggers fail-closed review", () => {
  const input = fixture();
  input.openapi.components.schemas[EXPECTED.uploadSchema].required.push("new_required_field");
  const report = run(input);
  assert.equal(report.checks.uploadRequiredFieldsMatch, false);
  assert.equal(report.reviewRequired, true);
});

test("missing required upload field triggers review", () => {
  const input = fixture();
  input.openapi.components.schemas[EXPECTED.uploadSchema].required.pop();
  assert.equal(run(input).reviewRequired, true);
});

test("missing archive settings query triggers review", () => {
  const input = fixture();
  input.openapi.paths[EXPECTED.settingsEndpoint].get.parameters = [];
  const report = run(input);
  assert.equal(report.checks.settingsArchivePathRequired, false);
  assert.equal(report.reviewRequired, true);
});

test("reopened issue triggers review", () => {
  const input = fixture();
  input.issue.state = "open";
  assert.equal(run(input).reviewRequired, true);
});

test("missing evidence fails closed", () => {
  assert.throws(
    () => createHostingerNodeContractMonitorReport({ openapi: null, issue: {} }),
    /missing_or_invalid:openapi/,
  );
  assert.throws(
    () => createHostingerNodeContractMonitorReport({ openapi: {}, issue: null }),
    /missing_or_invalid:issue/,
  );
});
