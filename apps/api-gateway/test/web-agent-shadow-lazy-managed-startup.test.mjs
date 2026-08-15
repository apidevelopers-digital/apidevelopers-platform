import assert from "node:assert/strict";
import test from "node:test";

import { resolveWebAgentShadowLazyManagedStartup } from "../src/web-agent-shadow-lazy-managed-startup.mjs";

test("shadow disabled does not load managed or operational modules", async () => {
  let managedLoads = 0;
  let operationalLoads = 0;

  const result = await resolveWebAgentShadowLazyManagedStartup({
    env: {},
    loadManagedBootstrap: async () => {
      managedLoads += 1;
      throw new Error("must not load");
    },
    loadOperationalRuntime: async () => {
      operationalLoads += 1;
      throw new Error("must not load");
    },
  });

  assert.equal(result.enabled, false);
  assert.equal(result.reason, "shadow_disabled");
  assert.equal(result.webAgentServerBootstrapOptions, undefined);
  assert.equal(managedLoads, 0);
  assert.equal(operationalLoads, 0);
});

test("shadow enabled lazily composes managed bootstrap options", async () => {
  const calls = [];
  const operationalRuntime = { store: { marker: "store" } };
  const options = { dependencies: { marker: "deps" } };
  const fetchImpl = async () => {};

  const result = await resolveWebAgentShadowLazyManagedStartup({
    env: {
      WEB_AGENT_SHADOW_ENABLED: "true",
      API_GATEWAY_STATE_FILE: "state.json",
    },
    cwd: "/tmp/gateway",
    fetchImpl,
    loadOperationalRuntime: async () => ({
      createOperationalRuntime(input) {
        calls.push(["runtime", input]);
        return operationalRuntime;
      },
    }),
    loadManagedBootstrap: async () => ({
      createWebAgentShadowManagedBootstrapOptions(input) {
        calls.push(["managed", input]);
        return options;
      },
    }),
  });

  assert.equal(result.enabled, true);
  assert.equal(result.reason, "shadow_enabled");
  assert.equal(result.webAgentServerBootstrapOptions, options);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], "runtime");
  assert.equal(calls[0][1].env.WEB_AGENT_SHADOW_ENABLED, "true");
  assert.equal(calls[0][1].cwd, "/tmp/gateway");
  assert.equal(calls[1][0], "managed");
  assert.equal(calls[1][1].operationalRuntime, operationalRuntime);
  assert.equal(calls[1][1].fetchImpl, fetchImpl);
});

test("shadow enabled fails closed when lazy modules are invalid", async () => {
  await assert.rejects(
    resolveWebAgentShadowLazyManagedStartup({
      env: { WEB_AGENT_SHADOW_ENABLED: "true" },
      loadManagedBootstrap: async () => ({}),
      loadOperationalRuntime: async () => ({
        createOperationalRuntime() {
          return { store: {} };
        },
      }),
    }),
    /createWebAgentShadowManagedBootstrapOptions must be a function/,
  );

  await assert.rejects(
    resolveWebAgentShadowLazyManagedStartup({
      env: { WEB_AGENT_SHADOW_ENABLED: "true" },
      loadManagedBootstrap: async () => ({
        createWebAgentShadowManagedBootstrapOptions() {
          return {};
        },
      }),
      loadOperationalRuntime: async () => ({}),
    }),
    /createOperationalRuntime must be a function/,
  );
});

test("shadow enablement is exact and does not treat truthy aliases as enabled", async () => {
  for (const value of ["1", "yes", "on", "enabled", "false", ""]) {
    const result = await resolveWebAgentShadowLazyManagedStartup({
      env: { WEB_AGENT_SHADOW_ENABLED: value },
    });
    assert.equal(result.enabled, false);
  }
});
