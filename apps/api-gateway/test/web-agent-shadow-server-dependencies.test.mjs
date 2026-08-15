import assert from "node:assert/strict";
import test from "node:test";

import { createWebAgentShadowServerDependencies } from "../src/web-agent-shadow-server-dependencies.mjs";

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

test("composes SaaS access from the operational store and preserves explicit providers", async () => {
  const store = createStore();
  const input = providers();

  const result = createWebAgentShadowServerDependencies({
    store,
    ...input,
  });

  assert.equal(result.resolveSessionByHash, input.resolveSessionByHash);
  assert.equal(result.tenantInternationalProfile, input.tenantInternationalProfile);
  assert.equal(result.commercialContext, input.commercialContext);
  assert.equal(typeof result.saasAccess.evaluateAccess, "function");
  assert.equal(typeof result.saasAccess.resolveActiveGrant, "function");
  assert.equal(Object.isFrozen(result), true);
});

test("fails closed when the operational store is absent or incomplete", () => {
  const input = providers();

  assert.throws(
    () => createWebAgentShadowServerDependencies({ ...input }),
    /store must provide read and transaction/,
  );

  assert.throws(
    () =>
      createWebAgentShadowServerDependencies({
        store: { read() {} },
        ...input,
      }),
    /store must provide read and transaction/,
  );
});

test("fails closed when any required server provider is missing", () => {
  const store = createStore();
  const input = providers();

  assert.throws(
    () =>
      createWebAgentShadowServerDependencies({
        store,
        tenantInternationalProfile: input.tenantInternationalProfile,
        commercialContext: input.commercialContext,
      }),
    /resolveSessionByHash/,
  );

  assert.throws(
    () =>
      createWebAgentShadowServerDependencies({
        store,
        resolveSessionByHash: input.resolveSessionByHash,
        commercialContext: input.commercialContext,
      }),
    /tenantInternationalProfile/,
  );

  assert.throws(
    () =>
      createWebAgentShadowServerDependencies({
        store,
        resolveSessionByHash: input.resolveSessionByHash,
        tenantInternationalProfile: input.tenantInternationalProfile,
      }),
    /commercialContext/,
  );
});

test("passes an optional clock into the official SaaS access composition", async () => {
  const store = createStore();
  const input = providers();
  const clock = () => "2026-08-15T17:10:00.000Z";

  const result = createWebAgentShadowServerDependencies({
    store,
    ...input,
    clock,
  });

  assert.equal(typeof result.saasAccess.evaluateAccess, "function");
});
