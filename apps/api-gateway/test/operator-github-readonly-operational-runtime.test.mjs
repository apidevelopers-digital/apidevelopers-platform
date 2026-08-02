import assert from "node:assert/strict";
import test from "node:test";

import {
  createOperationalGitHubReadonlyRuntime,
} from "../src/operator-github-readonly-operational-runtime.mjs";

function createRuntimeFactory(capture) {
  return ({ env, cwd, gatewayFactory }) => {
    capture.runtimeInput = { env, cwd };
    const gateway = gatewayFactory({
      stateFilePath: "/tmp/operator-runtime/state.json",
      adminKey: "test-only-admin",
    });
    return Object.freeze({
      app: gateway.app,
      readiness: gateway.readiness,
      store: gateway.store,
      descriptor: Object.freeze({
        mode: "operational",
        stateStore: "json-file",
        adminKeyConfigured: true,
      }),
    });
  };
}

test("runtime wrapper wires the explicit read-only stack without network or vault access during composition", () => {
  const capture = {
    vaultCalls: 0,
    fetchCalls: 0,
  };
  const adapters = Object.freeze({
    async status() {},
    async inventory() {},
    async read() {},
    async audit() {},
  });

  const runtime = createOperationalGitHubReadonlyRuntime({
    cwd: "/tmp/operator-runtime",
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
      API_GATEWAY_ADMIN_KEY: "test-only-admin",
      GITHUB_TOKEN: "must-not-be-used",
    },
    vaultClient: {
      async withSecretLease() {
        capture.vaultCalls += 1;
      },
    },
    fetchImpl: async () => {
      capture.fetchCalls += 1;
      return new Response("{}");
    },
    credentialRef: "vault://github/operator-readonly",
    organization: "apidevelopers-digital",
    now: () => new Date("2026-08-02T00:10:00.000Z"),
    gatewayOptions: {
      operatorReadonlyMaxBodyBytes: 64 * 1024,
    },
    stackFactory(options) {
      capture.stackOptions = options;
      return Object.freeze({
        adapters,
        descriptor: Object.freeze({
          provider: "github",
          runtimeActivated: false,
          productionChanged: false,
        }),
      });
    },
    gatewayFactory(options) {
      capture.gatewayOptions = options;
      return Object.freeze({
        app: Object.freeze({ async handleRequest() {} }),
        readiness: Object.freeze({ async check() {} }),
        store: Object.freeze({ async read() {} }),
      });
    },
    runtimeFactory: createRuntimeFactory(capture),
  });

  assert.equal(capture.vaultCalls, 0);
  assert.equal(capture.fetchCalls, 0);
  assert.equal(capture.stackOptions.credentialRef, "vault://github/operator-readonly");
  assert.equal(capture.stackOptions.organization, "apidevelopers-digital");
  assert.equal(capture.gatewayOptions.operatorReadonlyAdapters, adapters);
  assert.equal(capture.gatewayOptions.stateFilePath, "/tmp/operator-runtime/state.json");
  assert.deepEqual(runtime.descriptor.githubReadonly, {
    provider: "github",
    mode: "read-only",
    organization: "apidevelopers-digital",
    runtimeWired: true,
    credentialReferenceConfigured: true,
    environmentSecretFallback: false,
    networkCalledDuringComposition: false,
    productionChanged: false,
  });

  const serialized = JSON.stringify(runtime.descriptor);
  assert.equal(serialized.includes("must-not-be-used"), false);
  assert.equal(serialized.includes("vault://github/operator-readonly"), false);
  assert.equal(serialized.includes("test-only-admin"), false);
});

test("runtime wrapper prevents gateway options from overriding authority and provider wiring", () => {
  const base = {
    vaultClient: { async withSecretLease() {} },
    fetchImpl: async () => new Response("{}"),
    credentialRef: "vault://github/operator-readonly",
    organization: "apidevelopers-digital",
  };

  for (const key of [
    "stateFilePath",
    "adminKey",
   "operatorReadonlyAdapters",
   "githubReadonlyClient",
   "githubReadonlyOrganization",
   "githubReadonlyNow",
  ]) {
    assert.throws(
      () =>
        createOperationalGitHubReadonlyRuntime({
          ...base,
          gatewayOptions: { [key]: "forbidden" },
        }),
      new RegExp(`gatewayOptions\\.${key}`),
    );
  }
});

test("runtime wrapper requires explicit vault, transport, reference and organization inputs", () => {
  const complete = {
    vaultClient: { async withSecretLease() {} },
    fetchImpl: async () => new Response("{}"),
    credentialRef: "vault://github/operator-readonly",
    organization: "apidevelopers-digital",
  };

  for (const key of ["vaultClient", "fetchImpl", "credentialRef", "organization"]) {
    const input = { ...complete };
    delete input[key];
    assert.throws(
      () => createOperationalGitHubReadonlyRuntime(input),
      new RegExp(key),
    );
  }
});

test("runtime wrapper fails closed when factories violate the composition contract", () => {
  const base = {
    vaultClient: { async withSecretLease() {} },
    fetchImpl: async () => new Response("{}"),
    credentialRef: "vault://github/operator-readonly",
    organization: "apidevelopers-digital",
  };

  assert.throws(
    () =>
      createOperationalGitHubReadonlyRuntime({
        ...base,
        stackFactory() {
          return {};
        },
      }),
    /invalid read-only stack/,
  );

  assert.throws(
    () =>
      createOperationalGitHubReadonlyRuntime({
        ...base,
        stackFactory() {
          return { adapters: {} };
        },
        runtimeFactory() {
          return { descriptor: {} };
        },
      }),
    /did not create the operational gateway/,
  );

  assert.throws(
    () =>
      createOperationalGitHubReadonlyRuntime({
        ...base,
        stackFactory() {
          retur { adapters: {} };
        },
        runtimeFactory({ gatewayFactory }) {
          const gateway = gatewayFactory({});
          const gatewayAgain = gatewayFactory({});
          return {
            app: gateway.app,
            readiness: gateway.readiness,
            store: gateway.store,
            descriptor: {},
            duplicate: gatewayAgain,
          };
        },
        gatewayFactory() {
          return {
            app: { async handleRequest() {} },
            readiness: { async check() {} },
            store: { async read() {} },
          };
        },
      }),
    /exactly once/,
  );
});
