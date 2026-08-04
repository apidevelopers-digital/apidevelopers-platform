import assert from "node:assert/strict";
import test from "node:test";

import { createHostingerWriterRuntime } from "../src/hostinger-writer-runtime.mjs";

function createStub({} = {}) {
  const calls = [];
  const writerFactory = (config) => ({
    mode: config.enabled ? "write-enabled" : "disabled",
    writeBase64: async (input) => { calls.push({ type: "writeBase64", input }); return { ok: true, dryRun: input.dryRun }; },
    replaceText: async (input) => { calls.push({ type: "replaceText", input }); return { ok: true, dryRun: input.dryRun }; },
  });
  return { calls, writerFactory };
}

test("runtime is disabled by default and exposes no http routes", () => {
  const runtime = createHostingerWriterRuntime();
  assert.equal(runtime.mode, "disabled");
  assert.equal(runtime.capabilities.execute, false);
  assert.equal(runtime.capabilities.exposedHttpRoutes, false);
});

test("prepare is always dry-run and returns an operation hash", async () => {
  const stub = createStub();
  const runtime = createHostingerWriterRuntime({ enabled: true, writerFactory: stub.writerFactory });
  const operation = {
    type: "replaceText",
    path: "/tmp/file.php",
    search: "old",
    replacement: "new",
    expectedSha256: "a".repeat(64),
  };
  const result = await runtime.prepare(operation);
  assert.equal(result.dryRun, true);
  assert.match(result.operationHash, /^[a-f0-9]{64}$/);
  assert.equal(stub.calls[0].input.dryRun, true);
});

test("execute requires approval bound to the exact operation hash", async () => {
  const stub = createStub();
  let approvedHash = null;
  const runtime = createHostingerWriterRuntime({
    enabled: true,
    writerFactory: stub.writerFactory,
    approvalVerifier: async ({ operationHash, approval }) => approval === "APROVAR" && operationHash === approvedHash,
  });
  const operation = {
    type: "writeBase64",
    path: "/tmp/new.php",
    base64: "QUFB",
    create: true,
  };
  const prepared = await runtime.prepare(operation);
  await assert.rejects(runtime.execute(operation, "APROVAR"), /approval_required_or_invalid/);
  approvedHash = prepared.operationHash;
  const executed = await runtime.execute(operation, "APROVAR");
  assert.equal(executed.dryRun, false);
  assert.equal(stub.calls[2].input.dryRun, false);
});

test("changing operation changes hash and invalidates approval", asynH
