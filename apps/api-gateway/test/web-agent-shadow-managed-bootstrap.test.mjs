import assert from "node:assert/strict";
import test from "node:test";

import { createWebAgentShadowManagedBootstrapOptions } from "../src/web-agent-shadow-managed-bootstrap.mjs";

function createStore() {
  return {
    kind: "test",
    async read() {
      return { collections: {} };
    },
    async transaction(fn) {
      const tx = {
        get() { return null; },
        put() { return null; },
        delete() { return null; },
      };
      return { result: await fn(tx), revision: 1 };
    },
    async executeIdempotent(_key, fn) {
      const tx = {
        get() { return null; },
        put() { return null; },
        delete() { return null; },
      };
      return { executed: true, result: await fn(tx) };
    },
  };
}

test("managed bootstrap composes persisted providers from the operational store", () => {
  const operationalRuntime = { store: createStore() };
  const result = createWebAgentShadowManagedBootstrapOptions({ operationalRuntime });

  assert.equal(typeof result.dependencies.resolveSessionByHash, "function");
  assert.equal(typeof result.dependencies.tenantInternationalProfile.resolve, "function");
  assert.equal(typeof result.dependencies.commercialContext.resolve, "function");
  assert.equal(typeof result.dependencies.saasAccess.evaluateAccess, "function");
  assert.equal(Object.isFrozen(result), true);
});

test("managed bootstrap preserves an explicit fetch implementation without executing it", () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("network must not run during composition");
  };

  const result = createWebAgentShadowManagedBootstrapOptions({
    operationalRuntime: { store: createStore() },
    fetchImpl,
  });

  assert.equal(result.fetchImpl, fetchImpl);
  assert.equal(calls, 0);
});

test("managed bootstrap fails closed without the operational store", () => {
  assert.throws(
    () => createWebAgentShadowManagedBootstrapOptions({ operationalRuntime: {} }),
    /operationalRuntime\.store is required/,
  );
});
