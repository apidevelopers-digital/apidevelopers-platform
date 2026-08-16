import assert from "node:assert/strict";
import test from "node:test";

import { startWebAgentOperationalGateway } from "../src/web-agent-operational-startup.mjs";

test("web agent startup preserves the base gateway and injects the composed app before server start", async () => {
  const env = Object.freeze({ WEB_AGENT_SHADOW_ENABLED: "true" });
  const cwd = "/tmp/web-agent-operational-startup";
  const logger = Object.freeze({ log() {} });
  const baseApp = Object.freeze({ id: "base-app" });
  const wrappedApp = Object.freeze({ id: "web-agent-app" });
  const store = Object.freeze({ id: "store" });
  const runtime = Object.freeze({
    app: baseApp,
    store,
    host: "127.0.0.1",
    port: 0,
    descriptor: Object.freeze({ mode: "operational" }),
  });
  const server = Object.freeze({ id: "server" });
  const descriptor = Object.freeze({ enabled: true, mode: "shadow" });
  const calls = [];

  const result = await startWebAgentOperationalGateway({
    env,
    cwd,
    logger,
    runtimeFactory(options) {
      calls.push("runtime");
      assert.equal(options.env, env);
      assert.equal(options.cwd, cwd);
      return runtime;
    },
    webAgentFactory(options) {
      calls.push("web-agent");
      assert.equal(options.app, baseApp);
      assert.equal(options.store, store);
      assert.equal(options.env, env);
      return Object.freeze({ app: wrappedApp, descriptor });
    },
    async serverFactory(options) {
      calls.push("server");
      assert.equal(options.app, wrappedApp);
      assert.equal(options.host, runtime.host);
      assert.equal(options.port, runtime.port);
      return server;
    },
    async gatewayStarter(options) {
      calls.push("gateway");
      assert.equal(options.env, env);
      assert.equal(options.cwd, cwd);
      assert.equal(options.logger, logger);

      const createdRuntime = options.runtimeFactory({
        env: options.env,
        cwd: options.cwd,
      });
      const startedServer = await options.serverFactory({
        app: createdRuntime.app,
        host: createdRuntime.host,
        port: createdRuntime.port,
      });

      return Object.freeze({
        server: startedServer,
        runtime: createdRuntime,
        marker: "base-gateway",
      });
    },
  });

  assert.deepEqual(calls, ["gateway", "runtime", "web-agent", "server"]);
  assert.equal(result.server, server);
  assert.equal(result.runtime, runtime);
  assert.equal(result.marker, "base-gateway");
  assert.equal(result.webAgent, descriptor);
  assert.equal(Object.isFrozen(result), true);
});

test("web agent startup fails closed before composition when the operational store is unavailable", async () => {
  let webAgentCalled = false;
  let serverCalled = false;

  await assert.rejects(
    () =>
      startWebAgentOperationalGateway({
        env: {},
        runtimeFactory() {
          return Object.freeze({
            app: Object.freeze({ id: "base-app" }),
            host: "127.0.0.1",
            port: 0,
          });
        },
        webAgentFactory() {
          webAgentCalled = true;
          return Object.freeze({
            app: Object.freeze({}),
            descriptor: Object.freeze({ enabled: true, mode: "shadow" }),
          });
        },
        async serverFactory() {
          serverCalled = true;
          return Object.freeze({});
        },
        async gatewayStarter(options) {
          const runtime = options.runtimeFactory({});
          const server = await options.serverFactory({
            app: runtime.app,
            host: runtime.host,
            port: runtime.port,
          });
          return Object.freeze({ runtime, server });
        },
      }),
    /operational runtime store is unavailable/,
  );

  assert.equal(webAgentCalled, false);
  assert.equal(serverCalled, false);
});
