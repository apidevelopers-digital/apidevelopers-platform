import assert from "node:assert/strict";
import test from "node:test";

import {
  planFamilyDataRuntimeStart,
  startServerWithFamilyDataReadGate
} from "../src/family-data-read-runtime-gate.mjs";

test("runtime plan is canonical and inert by default", () => {
  assert.deepEqual(planFamilyDataRuntimeStart(), {
    enabled: false,
    mode: "canonical-runtime",
    requires_binding: false,
    binding_configured: false,
    reads_env: false,
    changes_main: false,
    deploy_executed: false
  });
});

test("disabled gate delegates to canonical startServer without Family Data wiring", async () => {
  const calls = [];
  const server = { kind: "canonical" };
  const result = await startServerWithFamilyDataReadGate({
    port: 3100,
    host: "127.0.0.1",
    startBase: async (options) => {
      calls.push(options);
      return server;
    }
  });

  assert.equal(result, server);
  assert.deepEqual(calls, [{ port: 3100, host: "127.0.0.1" }]);
});

test("enabled gate requires an explicit Family Data binding", async () => {
  await assert.rejects(
    () => startServerWithFamilyDataReadGate({
      enabled: true,
      createRuntime: () => {
        throw new Error("must not be called");
      }
    }),
    /familyDataBinding/
  );
});

test("enabled gate creates composed runtime and starts only that server", async () => {
  const events = [];
  const fakeServer = {
    once(event, handler) {
      events.push(["once", event]);
      this.errorHandler = handler;
      return this;
    },
    listen(port, host, callback) {
      events.push(["listen", port, host]);
      callback();
      return this;
    }
  };
  const familyDataBinding = {
    handleRequest: async () => null,
    status: () => ({ enabled: true })
  };

  const result = await startServerWithFamilyDataReadGate({
    enabled: true,
    familyDataBinding,
    port: 3200,
    host: "127.0.0.1",
    createRuntime: (options) => {
      events.push(["createRuntime", options.familyDataBinding === familyDataBinding]);
      return { server: fakeServer };
    },
    startBase: async () => {
      throw new Error("canonical start must not run when enabled");
    }
  });

  assert.equal(result, fakeServer);
  assert.deepEqual(events, [
    ["createRuntime", true],
    ["once", "error"],
    ["listen", 3200, "127.0.0.1"]
  ]);
});

test("invalid port is rejected before starting either runtime", async () => {
  await assert.rejects(
    () => startServerWithFamilyDataReadGate({
      port: 70000,
      startBase: async () => {
        throw new Error("must not run");
      }
    }),
    /port must be/
  );
});
