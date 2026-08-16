import assert from "node:assert/strict";
import test from "node:test";

import { createWebAgentShadowOperationalBootstrapOptions } from "../src/web-agent-shadow-operational-bootstrap.mjs";

function store() {
  return {
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

function providers() {
  return {
    resolveSessionByHash: async () => null,
    tenantInternationalProfile: {
      async resolve() {
        return {
          defaultLocale: "pt-BR",
          fallbackLocale: "en",
          timeZone: "America/Sao_Paulo",
          legalRegion: "BR",
        };
      },
    },
    commercialContext: {
      async resolve() {
        return { currency: "BRL" };
      },
    },
  };
}

test("binds the official operational store into shadow bootstrap dependencies", () => {
  const operationalStore = store();
  const input = providers();

  const result = createWebAgentShadowOperationalBootstrapOptions({
    operationalRuntime: { store: operationalStore },
    ...input,
  });

  assert.equal(typeof result.dependencies.saasAccess.evaluateAccess, "function");
  assert.equal(result.dependencies.resolveSessionByHash, input.resolveSessionByHash);
  assert.equal(
    result.dependencies.tenantInternationalProfile,
    input.tenantInternationalProfile,
  );
  assert.equal(result.dependencies.commercialContext, input.commercialContext);
  assert.equal(Object.isFrozen(result), true);
});

test("passes an explicit fetch implementation without executing it", () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("network must not run during binding");
  };

  const result = createWebAgentShadowOperationalBootstrapOptions({
    operationalRuntime: { store: store() },
    ...providers(),
    fetchImpl,
  });

  assert.equal(result.fetchImpl, fetchImpl);
  assert.equal(calls, 0);
});

test("fails closed without the operational runtime store", () => {
  assert.throws(
    () =>
      createWebAgentShadowOperationalBootstrapOptions({
        operationalRuntime: {},
        ...providers(),
      }),
    /operationalRuntime\.store is required/,
  );
});

test("delegates required provider validation to the canonical dependency composition", () => {
  assert.throws(
    () =>
      createWebAgentShadowOperationalBootstrapOptions({
        operationalRuntime: { store: store() },
        tenantInternationalProfile: providers().tenantInternationalProfile,
        commercialContext: providers().commercialContext,
      }),
    /resolveSessionByHash/,
  );
});
