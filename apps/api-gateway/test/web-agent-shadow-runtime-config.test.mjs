import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveWebAgentShadowRuntimeConfig,
  webAgentShadowRuntimeFlag,
} from "../src/web-agent-shadow-runtime-config.mjs";

function dependencies() {
  return {
    async resolveSessionByHash() {
      return {
        status: "active",
        expiresAt: "2026-08-16T00:00:00.000Z",
        principal: {
          id: "user:001",
          tenantId: "tenant:001",
          status: "active",
          scopes: ["web:chat"],
        },
      };
    },
    saasAccess: {
      async evaluateAccess() {
        return { allowed: true };
      },
    },
    tenantInternationalProfile: {
      async resolve() {
        return {
          defaultLocale: "pt-BR",
          fallbackLocale: "pt-BR",
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

test("shadow runtime remains disabled by default", () => {
  const result = resolveWebAgentShadowRuntimeConfig({
    env: {},
    dependencies: {},
    fetchImpl: undefined,
  });

  assert.equal(result.enabled, false);
  assert.equal(result.reason, "shadow_disabled");
  assert.equal(result.route, undefined);
});

test("shadow runtime remains disabled unless flag is exactly true", () => {
  for (const value of ["1", "yes", "on", "enabled", "false", ""]) {
    const result = resolveWebAgentShadowRuntimeConfig({
      env: { [webAgentShadowRuntimeFlag]: value },
      dependencies: {},
      fetchImpl: undefined,
    });
    assert.equal(result.enabled, false);
  }
});

test("enabled shadow requires server-side base URL and technical key", () => {
  assert.throws(
    () =>
      resolveWebAgentShadowRuntimeConfig({
        env: { [webAgentShadowRuntimeFlag]: "true" },
        dependencies: dependencies(),
        fetchImpl: async () => {},
      }),
    /WEB_AGENT_SHADOW_BASE_URL/,
  );

  assert.throws(
    () =>
      resolveWebAgentShadowRuntimeConfig({
        env: {
          [webAgentShadowRuntimeFlag]: "true",
          WEB_AGENT_SHADOW_BASE_URL: "https://runtime.example",
        },
        dependencies: dependencies(),
        fetchImpl: async () => {},
      }),
    /WEB_AGENT_SHADOW_API_KEY/,
  );
});

test("enabled shadow validates required browser-side server dependencies", () => {
  assert.throws(
    () =>
      resolveWebAgentShadowRuntimeConfig({
        env: {
          [webAgentShadowRuntimeFlag]: "true",
          WEB_AGENT_SHADOW_BASE_URL: "https://runtime.example",
          WEB_AGENT_SHADOW_API_KEY: "fixture-key",
        },
        dependencies: {},
        fetchImpl: async () => {},
      }),
    /resolveSessionByHash/,
  );
});

test("enabled shadow builds a route without exposing technical config", () => {
  const result = resolveWebAgentShadowRuntimeConfig({
    env: {
      [webAgentShadowRuntimeFlag]: "true",
      WEB_AGENT_SHADOW_BASE_URL: "https://runtime.example",
      WEB_AGENT_SHADOW_API_KEY: "fixture-key",
      WEB_AGENT_SHADOW_TIMEOUT_MS: "5000",
    },
    dependencies: dependencies(),
    fetchImpl: async () => {
      throw new Error("network must not be called during composition");
    },
  });

  assert.equal(result.enabled, true);
  assert.equal(result.reason, "shadow_enabled");
  assert.equal(typeof result.route.handle, "function");
  assert.equal("apiKey" in result, false);
  assert.equal("baseUrl" in result, false);
  assert.equal(
    JSON.stringify({ enabled: result.enabled, reason: result.reason }),
    '{"enabled":true,"reason":"shadow_enabled"}',
  );
});

test("timeout is fail-closed and bounded", () => {
  for (const value of ["0", "99", "30001", "abc", "10.5"]) {
    assert.throws(
      () =>
        resolveWebAgentShadowRuntimeConfig({
          env: {
            [webAgentShadowRuntimeFlag]: "true",
            WEB_AGENT_SHADOW_BASE_URL: "https://runtime.example",
            WEB_AGENT_SHADOW_API_KEY: "fixture-key",
            WEB_AGENT_SHADOW_TIMEOUT_MS: value,
          },
          dependencies: dependencies(),
          fetchImpl: async () => {},
        }),
      /WEB_AGENT_SHADOW_TIMEOUT_MS/,
    );
  }
});
