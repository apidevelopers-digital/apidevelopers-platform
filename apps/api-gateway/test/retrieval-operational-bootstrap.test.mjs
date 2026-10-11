import test from "node:test";
import assert from "node:assert/strict";

import {
  attachRetrievalOperationalRuntimeToGateway,
  resolveRetrievalOperationalEnabled,
} from "../src/retrieval-operational-bootstrap.mjs";

function gatewayFixture() {
  return Object.freeze({
    app: Object.freeze({
      async handleRequest() {
        return null;
      },
    }),
  });
}

test("retrieval operational feature flag is strict and disabled by default", () => {
  assert.equal(resolveRetrievalOperationalEnabled({}), false);
  assert.equal(
    resolveRetrievalOperationalEnabled({ RETRIEVAL_ENABLED: "false" }),
    false,
  );
  assert.equal(
    resolveRetrievalOperationalEnabled({ RETRIEVAL_ENABLED: "true" }),
    true,
  );
  assert.throws(
    () =>
      resolveRetrievalOperationalEnabled({
        RETRIEVAL_ENABLED: "yes",
      }),
    (error) => error.code === "RETRIEVAL_OPERATIONAL_INVALID_FLAG",
  );
});

test("disabled operational bootstrap performs no governed provider wiring", () => {
  const calls = [];
  const gateway = gatewayFixture();

  const result = attachRetrievalOperationalRuntimeToGateway({
    gateway,
    env: {},
    runtimeFactory(options) {
      calls.push(options);
      return Object.freeze({
        enabled: false,
        status: "disabled",
      });
    },
    resolveRuntimeOptions() {
      throw new Error("must not resolve provider wiring while disabled");
    },
  });

  assert.deepEqual(calls, [{ enabled: false }]);
  assert.equal(result.app, gateway.app);
  assert.equal(result.retrievalRuntime.enabled, false);
  assert.equal(result.retrievalOperational.enabled, false);
  assert.equal(result.retrievalOperational.status, "disabled");
  assert.deepEqual(result.retrievalOperational.connectorIds, []);
  assert.deepEqual(result.retrievalOperational.resolverIds, []);
});

test("enabled operational bootstrap fails closed without explicit governed wiring", () => {
  let runtimeCalls = 0;

  assert.throws(
    () =>
      attachRetrievalOperationalRuntimeToGateway({
        gateway: gatewayFixture(),
        env: { RETRIEVAL_ENABLED: "true" },
        runtimeFactory() {
          runtimeCalls += 1;
          return Object.freeze({
            enabled: true,
            status: "ready",
            connectorIds: ["mail"],
            resolverIds: [],
          });
        },
      }),
    (error) => error.code === "RETRIEVAL_OPERATIONAL_WIRING_REQUIRED",
  );

  assert.equal(runtimeCalls, 0);
});

test("enabled operational bootstrap requires at least one governed connector", () => {
  assert.throws(
    () =>
      attachRetrievalOperationalRuntimeToGateway({
        gateway: gatewayFixture(),
        env: { RETRIEVAL_ENABLED: "true" },
        resolveRuntimeOptions() {
          return Object.freeze({
            tenantId: "tenant-test",
          });
        },
        runtimeFactory(options) {
          assert.equal(options.enabled, true);
          assert.equal(options.tenantId, "tenant-test");
          return Object.freeze({
            enabled: true,
            status: "ready",
            connectorIds: [],
            resolverIds: [],
          });
        },
      }),
    (error) => error.code === "RETRIEVAL_OPERATIONAL_PROVIDER_REQUIRED",
  );
});

test("enabled operational bootstrap exposes only runtime descriptor metadata", () => {
  const gateway = gatewayFixture();

  const result = attachRetrievalOperationalRuntimeToGateway({
    gateway,
    env: { RETRIEVAL_ENABLED: "true" },
    resolveRuntimeOptions({ gateway: receivedGateway, env }) {
      assert.equal(receivedGateway, gateway);
      assert.equal(env.RETRIEVAL_ENABLED, "true");
      return Object.freeze({
        tenantId: "tenant-test",
      });
    },
    runtimeFactory(options) {
      assert.equal(options.enabled, true);
      assert.equal(options.tenantId, "tenant-test");
      return Object.freeze({
        enabled: true,
        status: "ready",
        connectorIds: Object.freeze(["peterle-mail"]),
        resolverIds: Object.freeze(["mail-body"]),
        search: async () => ({ results: [] }),
        fetchContent: async () => ({ text: "" }),
      });
    },
  });

  assert.equal(result.app, gateway.app);
  assert.equal(result.retrievalOperational.enabled, true);
  assert.equal(result.retrievalOperational.status, "ready");
  assert.deepEqual(result.retrievalOperational.connectorIds, ["peterle-mail"]);
  assert.deepEqual(result.retrievalOperational.resolverIds, ["mail-body"]);
  assert.equal("search" in result.retrievalOperational, false);
  assert.equal("fetchContent" in result.retrievalOperational, false);
  assert.equal(Object.isFrozen(result.retrievalOperational), true);
});
