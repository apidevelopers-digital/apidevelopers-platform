import test from "node:test";
import assert from "node:assert/strict";
import { classifyHostingerNodeArchiveDrift } from "../src/hostinger-node-upstream-drift.mjs";

const current = "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds";
const legacy = `${current}/from-archive`;
const officialSchema = "#/components/schemas/Hosting.V1.NodeJs.StartBuildRequest";
const build = (ref) => ({
  paths: {
    [current]: {
      post: {
        requestBody: {
          content: {
            "application/json": { schema: { $ref: ref } }
          }
        }
      }
    }
  }
});

test("recognizes the official Hosting Node build schema without enabling writes", () => {
  const report = classifyHostingerNodeArchiveDrift(build(officialSchema));
  assert.equal(report.status, "legacy-removed-new-contract-review-required");
  assert.equal(report.newArchiveFlowDocumented, true);
  assert.equal(report.requiresManualReview, true);
  assert.equal(report.writesEnabled, false);
  assert.equal(report.productionExecutionAllowed, false);
});

test("fails closed on the incorrect Hostinger schema namespace", () => {
  const report = classifyHostingerNodeArchiveDrift(
    build("#/components/schemas/Hostinger.V1.NodeJs.StartBuildRequest")
  );
  assert.equal(report.status, "contract-unverified-blocked");
  assert.equal(report.newArchiveFlowDocumented, false);
  assert.equal(report.productionExecutionAllowed, false);
});

test("fails closed on unknown schema reference", () => {
  const report = classifyHostingerNodeArchiveDrift(build("#/components/schemas/Unknown"));
  assert.equal(report.status, "contract-unverified-blocked");
  assert.equal(report.newArchiveFlowDocumented, false);
  assert.equal(report.writesEnabled, false);
});

test("legacy operation is still reported for review", () => {
  const report = classifyHostingerNodeArchiveDrift({ paths: { [legacy]: { post: {} } } });
  assert.equal(report.status, "legacy-present-review-required");
  assert.equal(report.productionExecutionAllowed, false);
});
