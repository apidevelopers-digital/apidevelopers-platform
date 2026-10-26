import test from "node:test";
import assert from "node:assert/strict";
import { createHostingerNodeTusMonitorReport } from "../src/hostinger-node-tus-monitor.mjs";

test("TUS monitor rejects missing official contract evidence", () => {
  assert.throws(() => createHostingerNodeTusMonitorReport({
    openapi: {}, issue: {}, username: "user", domain: "example.test", archivePath: "site.zip"
  }));
});

test("TUS monitor rejects invalid archive paths without execution", () => {
  assert.throws(() => createHostingerNodeTusMonitorReport({
    openapi: {}, issue: {}, username: "user", domain: "example.test", archivePath: "../bad.zip"
  }));
});
