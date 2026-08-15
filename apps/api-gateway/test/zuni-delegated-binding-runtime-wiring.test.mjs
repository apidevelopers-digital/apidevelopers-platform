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

test("operational server resolves delegated binding signer from secure bootstrap seam", async () => {
  let resolverInput = null;
  let receivedSigner = null;
  const secretProvider = Object.freeze({ withSecret() {} });
  const logs = [];

  const server = {
    address() {
      return { address: "127.0.0.1", port: 3000 };
    },
  };

  await startOperationalGateway({
    env: {
      ZUNI_DELEGATED_BINDING_PRIVATE_KEY_REF: "vault://zuni/binding",
      ZUNI_DELEGATED_BINDING_KEY_ID: "zuni-binding-2026-08",
    },
    cwd: "/tmp",
    logger: { log(line) { logs.push(JSON.parse(line)); } },
    delegatedBindingSecretProvider: secretProvider,
    delegatedBindingSignerResolver: async (input) => {
      resolverInput = input;
      return Object.freeze({
        configured: true,
        signer,
        descriptor: Object.freeze({
          configured: true,
          mode: "secret-reference",
          keyId: "zuni-binding-2026-08",
          privateKeyReferenceConfigured: true,
          privateKeyMaterialConfigured: false,
        }),
      });
    },
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

  assert.equal(resolverInput.secretProvider, secretProvider);
  assert.equal(receivedSigner, signer);
  assert.equal(logs[0].delegatedBinding.mode, "secret-reference");
  assert.equal(logs[0].delegatedBinding.privateKeyMaterialConfigured, false);
});

test("operational server keeps delegated binding disabled when resolver is unconfigured", async () => {
  let receivedSigner = "unset";

  const server = {
    address() {
      return { address: "127.0.0.1", port: 3000 };
    },
  };

  await startOperationalGateway({
    env: {},
    cwd: "/tmp",
    logger: { log() {} },
    delegatedBindingSignerResolver: async () =>
      Object.freeze({
        configured: false,
        signer: null,
        descriptor: Object.freeze({
          configured: false,
          mode: "deny-by-default",
          privateKeyMaterialConfigured: false,
        }),
      }),
    runtimeFactory: (options) => {
      receivedSigner = options.delegatedBindingSigner;
      return {
        app: Object.freeze({ handleRequest() {} }),
        host: "127.0.0.1",
        port: 0,
        descriptor: Object.freeze({}),
      };
    },
    serverFactory: async () => server,
  });

  assert.equal(receivedSigner, undefined);
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
