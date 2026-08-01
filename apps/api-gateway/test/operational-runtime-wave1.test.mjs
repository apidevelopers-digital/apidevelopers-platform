import assert from "node:assert/strict";
import test from "node:test";

import { createOperationalRuntime } from "../src/operational-runtime.mjs";

test("runtime uses the read-only gateway factory contract", () => {
  let options;
  const runtime = createOperationalRuntime({
    cwd: "/tmp/operator-wave1",
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
      API_GATEWAY_ADMIN_KEY: "test-only-key",
      HOST: "127.0.0.1",
      PORT: "0",
    },
    gatewayFactory(received) {
      options = received;
      return {
        app: { async handleRequest() {} },
        readiness: { async check() {} },
        store: { async read() {} },
      };
    },
  });

  assert.equal(options.stateFilePath, "/tmp/operator-wave1/state.json");
  assert.equal(options.adminKey, "test-only-key");
  assert.equal(runtime.descriptor.readonlyOperatorConfigured, true);
  assert.equal(runtime.descriptor.externalAdaptersConfigured, false);
  assert.equal(JSON.stringify(runtime.descriptor).includes("test-only-key"), false);
});
