import test from "node:test";
import assert from "node:assert/strict";

import { createOperationalRuntime } from "../src/operational-runtime.mjs";
import { startOperationalGateway } from "../src/operational-server.mjs";

const signer = Object.freeze({
  signBinding() {
    return Object.freeze({ proof: "opaque" });
  },
});

test("operational runtime forwards delegated binding signer into gateway composition", () => {
  let receivedSigner = null;

  const runtime = createOperationalRuntime({
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
      PORT: "0",
    },
    cwd: "/tmp",
    delegatedBindingSigner: signer,
    githubRuntimeFactory: () => ({
      configured: false,
      descriptor: Object.freeze({ configured: false }),
    }),
    gatewayFactory: (options) => {
      receivedSigner = options.delegatedBindingSigner;
      return Object.freeze({
        app: Object.freeze({ handleRequest() {} }),
        readiness: Object.freeze({}),
        store: Object.freeze({}),
      });
    },
  });

  assert.equal(receivedSigner, signer);
  assert.equal(runtime.descriptor.delegatedBindingSignerConfigured, true);
});

test("operational server forwards delegated binding signer into runtime factory", async () => {
  let receivedSigner = null;

  const server = {
    address() {
      return { address: "127.0.0.1", port: 3000 };
    },
  };

  await startOperationalGateway({
    env: {},
    cwd: "/tmp",
    logger: { log() {} },
    delegatedBindingSigner: signer,
    runtimeFactory: (options) => {
      receivedSigner = options.delegatedBindingSigner;
      return {
        app: Object.freeze({ handleRequest() {} }),
        host: "127.0.0.1",
        port: 0,
        descriptor: Object.freeze({
          delegatedBindingSignerConfigured: Boolean(
            options.delegatedBindingSigner,
          ),
        }),
      };
    },
    serverFactory: async () => server,
  });

  assert.equal(receivedSigner, signer);
});

test("runtime and server reject malformed delegated binding signer", async () => {
  assert.throws(
    () =>
      createOperationalRuntime({
        env: { API_GATEWAY_STATE_FILE: "state.json" },
        cwd: "/tmp",
        delegatedBindingSigner: {},
      }),
    /delegatedBindingSigner\.signBinding must be a function/,
  );

  await assert.rejects(
    () =>
      startOperationalGateway({
        delegatedBindingSigner: {},
      }),
    /delegatedBindingSigner\.signBinding must be a function/,
  );
});
