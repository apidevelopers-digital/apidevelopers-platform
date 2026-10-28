import test from "node:test";
import assert from "node:assert/strict";
import { createHostingerNodeTusMonitorReport } from "../src/hostinger-node-tus-monitor.mjs";

test("TUS monitor reports missing official contract evidence as blocked", () => {
  const report = createHostingerNodeTusMonitorReport({
    openapi: {}, issue: {}, username: "user", domain: "example.test", archivePath: "site.zip"
  });
  assert.equal(report.reviewRequired, true);
  assert.equal(report.tusMigration.writesEnabled, false);
  assert.equal(report.tusMigration.migrationReadyForProduction, false);
  assert.equal(report.barriers.tusMigrationExecutionBlocked, true);
});

test("TUS monitor rejects invalid archive paths without execution", () => {
  assert.throws(() => createHostingerNodeTusMonitorReport({
    openapi: {}, issue: {}, username: "user", domain: "example.test", archivePath: "../bad.zip"
  }), /invalid_archive_path/);
});
