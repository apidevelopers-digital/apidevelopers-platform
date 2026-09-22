import assert from "node:assert/strict";
import test from "node:test";

import { startOperationalGatewayWithSecretHandoff } from "../src/operational-secret-handoff-server.mjs";

function fixtures() {
  const app = Object.freeze({
    async handleRequest() {
      return { status: 404, headers: {}, body: "{}" };
    },
  });
  const authenticator = Object.freeze({
    async authenticate() {
      return {
        role: "admin",
        principal: { id: "admin", scopes: ["admin:*"] },
      };
    },
  });
  const authorization = Object.freeze({
    decide() {
      return { effect: "allow" };
    },
  });
  const server = Object.freeze({
    address() {
      return { address: "127.0.0.1", port: 3000 };
    },
  });

  return { app, authenticator, authorization, server };
}

function runtimeFactoryFor({ app, authenticator, authorization }) {
  return (options = {}) => {
    const gateway = Object.freeze({
      app,
      authenticator,
      authorization,
    });
    const transformed = options.gatewayTransform({ gateway });
    return Object.freeze({
      app: transformed.app,
      host: "127.0.0.1",
      port: 3000,
      descriptor: Object.freeze({
        mode: "operational",
        adminKeyConfigured: true,
      }),
    });
  };
}

function gatewayStarterFor(server) {
  return async ({ runtimeFactory, serverFactory }) => {
    const runtime = runtimeFactory({});
    const resolvedServer = await serverFactory({
      app: runtime.app,
      host: runtime.host,
      port: runtime.port,
    });
    return Object.freeze({ server: resolvedServer, runtime });
  };
}

test("startup keeps secret handoff absent from transport when disabled by default", async () => {
  const { app, authenticator, authorization, server } = fixtures();
  let serverOptions;

  const started = await startOperationalGatewayWithSecretHandoff({
    env: { API_GATEWAY_ADMIN_KEY: "fake-admin-key-not-a-real-secret" },
    runtimeFactory: runtimeFactoryFor({ app, authenticator, authorization }),
    gatewayStarter: gatewayStarterFor(server),
    async serverFactory(options) {
      serverOptions = options;
      return server;
    },
  });

  assert.equal(started.secretHandoff.enabled, false);
  assert.equal(Object.hasOwn(serverOptions, "secretHandoffHttpApp"), false);
});

test("startup composes canonical auth and binary handoff only behind explicit enable flag", async () => {
  const { app, authenticator, authorization, server } = fixtures();
  let serverOptions;

  const started = await startOperationalGatewayWithSecretHandoff({
    env: {
      API_GATEWAY_ADMIN_KEY: "fake-admin-key-not-a-real-secret",
      OPERATOR_SECRET_HANDOFF_ENABLED: "true",
    },
    runtimeFactory: runtimeFactoryFor({ app, authenticator, authorization }),
    gatewayStarter: gatewayStarterFor(server),
    async serverFactory(options) {
      serverOptions = options;
      return server;
    },
  });

  assert.equal(started.secretHandoff.enabled, true);
  assert.equal(
    typeof serverOptions.secretHandoffHttpApp?.handleRequest,
    "function",
  );
  assert.equal(
    typeof started.secretHandoff.secretProvider?.withSecret,
    "function",
  );
  assert.equal(started.secretHandoff.descriptor.requiredScope, "admin:*");
  assert.equal(started.secretHandoff.descriptor.productionChanged, false);
});
