import assert from "node:assert/strict";
import test from "node:test";

import { runOperationalMain } from "../src/operational-server.mjs";

test("operational main runs uni.co bootstrap against runtime app before shutdown registration", async () => {
  const events = [];
  const app = { handleRequest() {} };
  const server = { close() {} };
  const runtime = { app };
  const env = { UNI_CO_PREVIEW_BOOTSTRAP_ENABLED: "false" };

  const result = await runOperationalMain({
    env,
    startGateway: async ({ env: receivedEnv }) => {
      events.push(["start", receivedEnv]);
      return { server, runtime };
    },
    bootstrapRunner: async ({ app: receivedApp, env: receivedEnv }) => {
      events.push(["bootstrap", receivedApp, receivedEnv]);
      return { executed: false };
    },
    shutdownRegistrar: ({ server: receivedServer }) => {
      events.push(["shutdown", receivedServer]);
    },
  });

  assert.equal(result.server, server);
  assert.equal(result.runtime, runtime);
  assert.deepEqual(events, [
    ["start", env],
    ["bootstrap", app, env],
    ["shutdown", server],
  ]);
});
