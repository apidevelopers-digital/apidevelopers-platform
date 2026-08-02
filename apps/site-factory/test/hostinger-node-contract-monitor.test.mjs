import test from "node:test";
import assert from "node:assert/strict";

import {
  createHostingerNodeContractMonitorReport,
  EXPECTED,
} from "../src/hostinger-node-contract-monitor.mjs";

function createOpenApi({
  apiVersion = EXPECTED.apiVersion,
  mediaType = EXPECTED.mediaType,
  archiveType = "string",
  operationId = EXPECTED.operationId,
} = {}) {
  return {
    openapi: EXPECTED.openapiVersion,
    info: { version: apiVersion },
    paths: {
      [EXPECTED.endpoint]: {
        post: {
          operationId,
          requestBody: {
            content: {
              [mediaType]: {
                schema: { $ref: `#/components/schemas/${EXPECTED.schemaName}` },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        "Hosting.V1.NodeJs.CreateFromArchiveRequest": {
          type: "object",
          required: ["archive"],
          properties: {
            archive: { type: archiveType },
          },
        },
      },
    },
  };
}

function createIssue({ state = "open", number = 56 } = {}) {
  return {
    number,
    state,
    title: "Node.js deployment by archive endpoint is not usable",
    updated_at: "2026-08-02T08:00:00Z",
    html_url: "https://github.com/hostinger/api/issues/56",
  };
}

test("returns unchanged-blocked for the pinned official contract", () => {
  const first = createHostingerNodeContractMonitorReport({
    openapi: createOpenApi(),
    issue: createIssue(),
    observedAt: "2026-08-02T08:10:00Z",
  });
  const second = createHostingerNodeContractMonitorReport({
    openapi: createOpenApi(),
    issue: createIssue(),
    observedAt: "2026-08-02T08:10:00Z",
  });

  assert.equal(first.status, "unchanged-blocked");
  assert.equal(first.reviewRequired, false);
  assert.equal(first.changeSignals.contractChanged, false);
  assert.equal(first.changeSignals.issueChanged, false);
  assert.equal(first.barriers.hostingerPostExecuted, false);
  assert.equal(first.fingerprint, second.fingerprint);
});

test("requires review when the official contract changes", () => {
  const report = createHostingerNodeContractMonitorReport({
    openapi: createOpenApi({ mediaType: "multipart/form-data" }),
    issue: createIssue(),
    observedAt: "2026-08-02T08:10:00Z",
  });

  assert.equal(report.status, "review-required");
  assert.equal(report.reviewRequired, true);
  assert.equal(report.changeSignals.contractChanged, true);
  assert.equal(report.checks.mediaTypeMatches, false);
  assert.equal(
    report.nextAction,
    "open_review_pull_request_before_any_executor_change",
  );
});

test("requires review when the upstream issue closes", () => {
  const report = createHostingerNodeContractMonitorReport({
    openapi: createOpenApi(),
    issue: createIssue({ state: "closed" }),
    observedAt: "2026-08-02T08:10:00Z",
  });

  assert.equal(report.status, "review-required");
  assert.equal(report.changeSignals.issueChanged, true);
  assert.equal(report.changeSignals.officialIssueClosed, true);
  assert.equal(report.checks.issueStillOpen, false);
});

test("requires review when the request schema reference changes", () => {
  const openapi = createOpenApi();
  openapi.paths[EXPECTED.endpoint].post.requestBody.content[
    EXPECTED.mediaType
  ].schema.$ref = "#/components/schemas/Missing";

  const report = createHostingerNodeContractMonitorReport({
    openapi,
    issue: createIssue(),
  });

  assert.equal(report.status, "review-required");
  assert.equal(report.checks.schemaRefMatches, false);
  assert.equal(report.changeSignals.contractChanged, true);
});
