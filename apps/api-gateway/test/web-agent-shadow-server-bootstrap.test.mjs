import assert from "node:assert/strict";
import test from "node:test";

import { createWebAgentServerBootstrap } from "../src/web-agent-shadow-server-bootstrap.mjs";

function route(label) {
  return Object.freeze({
    label,
    async handle() {
      return { status: 503, payload: { error: `${label}_unavailable` } };
    },
    async readBody() {
      return {};
    },
  });
}

test("server bootstrap stays dark when shadow runtime is disabled", () => {
  const fallback = route("dark");
  const result = createWebAgentServerBootstrap({
    env: {},
    dependencies: {},
    fetchImpl: undefined,
    createFallbackRoute: () => fallback,
    resolveShadowRuntimeConfig() {
      return { enabled: false, reason: "shadow_disabled" };
    },
  });

  assert.equal(result.enabled, false);
  assert.equal(result.mode, "dark");
  assert.equal(result.reason, "shadow_disabled");
  assert.equal(result.route, fallback);
});

test("server bootstrap selects shadow route only after explicit runtime enablement", () => {
  const fallback = route("dark");
  const shadowRoute = route("shadow");
  const result = createWebAgentServerBootstrap({
    env: { WEB_AGENT_SHADOW_ENABLED: "true" },
    dependencies: { marker: "server-only" },
    fetchImpl: async () => {
      throw new Error("network must not run during bootstrap");
    },
    createFallbackRoute: () => fallback,
    resolveShadowRuntimeConfig(input) {
      assert.equal(input.env.WEB_AGENT_SHADOW_ENABLED, "true");
      assert.equal(input.dependencies.marker, "server-only");
      return {
        enabled: true,
        reason: "shadow_enabled",
        route: shadowRoute,
      };
    },
  });

  assert.equal(result.enabled, true);
  assert.equal(result.mode, "shadow");
  assert.equal(result.reason, "shadow_enabled");
  assert.equal(result.route, shadowRoute);
  assert.notEqual(result.route, fallback);
});

test("server bootstrap fails closed when enabled config has no valid route", () => {
  assert.throws(
    () =>
      createWebAgentServerBootstrap({
        createFallbackRoute: () => route("dark"),
        resolveShadowRuntimeConfig() {
          return { enabled: true, reason: "shadow_enabled" };
        },
      }),
    /shadow route must provide handle and readBody/,
  );
});

test("server bootstrap rejects invalid resolver output instead of falling back silently", () => {
  assert.throws(
    () =>
      createWebAgentServerBootstrap({
        createFallbackRoute: () => route("dark"),
        resolveShadowRuntimeConfig() {
          return null;
        },
      }),
    /shadow runtime config must return an object/,
  );
});

test("server bootstrap never surfaces runtime credentials in its public result", () => {
  const result = createWebAgentServerBootstrap({
    env: {
      WEB_AGENT_SHADOW_ENABLED: "true",
      WEB_AGENT_SHADOW_API_KEY: "fixture-secret",
      WEB_AGENT_SHADOW_BASE_URL: "https://runtime.example",
    },
    createFallbackRoute: () => route("dark"),
    resolveShadowRuntimeConfig() {
      return {
        enabled: true,
        reason: "shadow_enabled",
        route: route("shadow"),
        apiKey: "fixture-secret",
        baseUrl: "https://runtime.example",
      };
    },
  });

  assert.deepEqual(Object.keys(result).sort(), [
    "enabled",
    "mode",
    "reason",
    "route",
  ]);
  assert.equal("apiKey" in result, false);
  assert.equal("baseUrl" in result, false);
});
