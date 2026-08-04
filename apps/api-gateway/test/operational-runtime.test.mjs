import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createOperationalRuntime,
  resolveOperationalRuntimeConfig,
} from "../src/operational-runtime.mjs";
import { startOperationalGateway } from "../src/operational-server.mjs";

test("operational runtime requires an explicit state file", () => {
  assert.throws(
    () => resolveOperationalRuntimeConfig({ env: {} }),
    /API_GATEWAY_STATE_FILE is required/,
  );
});

test("operational runtime-validates the listening port", () => {
  assert.throws(
    () =>
      resolveOperationalRuntimeConfig({
        env: {
          API_GATEWAY_STATE_FILE: "state.json",
          PORT: "70000",
        },
      }),
    /PORT must be an integer between 0 and 65535/,
  );
});

test("operational runtime resolves configuration without exposing secrets in its descriptor", () => {
  let received;
  const runtime = createOperationalRuntime({
    cwd: "/tmp/runtime",
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
      API_GATEWAY_ADMIN_KEY: "super-secret",
      HOST: "0.0.0.0",
      PORT: "0",
    },
    gatewayFactory(options) {
      received = options;
      return {
        app: { async handleRequest() {} },
        readiness: {},
        store: {},
      };
    },
  });

  assert.equal(received.stateFilePath, "/tmp/runtime/state.json");
  assert.equal(received.adminKey, "super-secret");
  assert.equal(runtime.host, "0.0.0.0");
  assert.equal(runtime.port, 0);
  assert.deepEqual(runtime.descriptor, {
    mode: "operational",
    stateStore: "json-file",
    adminKeyConfigured: true,
    githubReadonly: {
      configured: false,
      mode: "deny-by-default",
      reason: "github_readonly_not_configured",
      productionChanged: false,
    },
    hostingerWriter: {
      mode: "disabled",
      capabilities: {
        prepare: true,
        execute: false,
        approvalRequired: true,
        operationHashBound: true,
        exposedHttpRoutes: false,
      },
    },
  });
  assert.equal(JSON.stringify(runtime.descriptor).includes("super-secret"), false);
  assert.equal(JSON.stringify(runtime.descriptor).includes("/tmp/runtime"), false);
});

test("operational runtime serves readiness from the real JSON persistence store", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "api-gateway-runtime-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const logs = [];
  const { server } = await startOperationalGateway({
    cwd: directory,
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
      HOST: "127.0.0.1",
      PORT: "0",
    },
    logger: {
      log(line) {
        logs.push(JSON.parse(line));
      },
    },
  });
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );

  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(
    `http://127.0.0.1:${address.port}/ready`,
  );
  const report = await response.json();

  assert.equal(response.status, 200);
  assert.equal(report.status, "ready");
  assert.deepEqual(report.checks, [
    {
      name: "persistence",
      critical: true,
      status: "ok",
      code: "readable",
    },
  ]);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, "api_gateway_operational_started");
  assert.equal(logs[0].mode, "operational");
  assert.equal(JSON.stringify(logs[0]).includes(directory), false);
});

test("operational startup fails before binding when configuration is incomplete", async () => {
  await assert.rejects(
    () =>
      startOperationalGateway({
        env: {},
        logger: { log() {} },
      }),
    /API_GATEWAY_STATE_FILE is required/,
  );
});
