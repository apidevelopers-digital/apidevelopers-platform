import assert from "node:assert/strict";
import test from "node:test";

import { startWebAgentOperationalGateway } from "../src/web-agent-operational-startup.mjs";

test("web agent startup composes starter and external gateway transforms before server start", async () => {
  const env = Object.freeze({ TEST_GATEWAY_TRANSFORM: "true" });
  const baseApp = Object.freeze({ id: "base" });
  const internalApp = Object.freeze({ id: "internal" });
  const externalApp = Object.freeze({ id: "external" });
  const webAgentApp = Object.freeze({ id: "web-agent" });
  const store = Object.freeze({ id: "store" });
  const server = Object.freeze({ id: "server" });
  const calls = [];

  const result = await startWebAgentOperationalGateway({
    env,
    gatewayTransform(context) {
      calls.push("external-transform");
      assert.equal(context.env, env);
      assert.equal(context.gateway.app, internalApp);
      return Object.freeze({ ...context.gateway, app: externalApp });
    },
    runtimeFactory(options) {
      calls.push("runtime");
      const baseGateway = Object.freeze({ app: baseApp, store });
      const gateway = options.gatewayTransform({
        gateway: baseGateway,
        env,
        cwd: "/tmp/test",
        config: Object.freeze({}),
      });
      assert.equal(gateway.app, externalApp);
      return Object.freeze({
        app: gateway.app,
        store,
        host: "127.0.0.1",
        port: 0,
      });
    },
    webAgentFactory(options) {
      calls.push("web-agent");
      assert.equal(options.app, externalApp);
      assert.equal(options.store, store);
      return Object.freeze({
        app: webAgentApp,
        descriptor: Object.freeze({ enabled: true, mode: "shadow" }),
      });
    },
    async serverFactory(options) {
      calls.push("server");
      assert.equal(options.app, webAgentApp);
      return server;
    },
    async gatewayStarter(options) {
      calls.push("gateway");
      assert.equal(options.gatewayTransform, undefined);
      const internalTransform = (context) => {
        calls.push("internal-transform");
        return Object.freeze({ ...context.gateway, app: internalApp });
      };
      const runtime = options.runtimeFactory({
        env,
        gatewayTransform: internalTransform,
      });
      const startedServer = await options.serverFactory({
        app: runtime.app,
        host: runtime.host,
        port: runtime.port,
      });
      return Object.freeze({ runtime, server: startedServer });
    },
  });

  assert.deepEqual(calls, [
    "gateway",
    "runtime",
    "internal-transform",
    "external-transform",
    "web-agent",
    "server",
  ]);
  assert.equal(result.runtime.app, externalApp);
  assert.equal(result.server, server);
  assert.equal(result.webAgent.enabled, true);
});
