import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import { startOperationalGateway } from "../src/operational-server.mjs";

function createEphemeralPrivateKeyPem() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" });
}

function createServerFactory() {
  return async () => ({
    address() {
      return { address: "127.0.0.1", port: 3000 };
    },
  });
}

test("operational gateway default delegated binding resolver is product-aware for UniJuri", async () => {
  const privateKeyPem = createEphemeralPrivateKeyPem();
  let runtimeOptions;
  let observedAccess;

  const secretProvider = {
    async withSecret(access, consumer) {
      observedAccess = access;
      const bytes = Buffer.from(privateKeyPem, "utf8");
      try {
        return await consumer(Object.freeze({ bytes }));
      } finally {
        bytes.fill(0);
      }
    },
  };

  const env = {
    UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_REF:
      "secret://uni-juri/delegated-binding/private-key",
    UNIJURI_DELEGATED_BINDING_KEY_ID: "uni-juri-binding-test",
    UNIJURI_DELEGATED_BINDING_TTL_SECONDS: "60",
  };

  await startOperationalGateway({
    env,
    cwd: "/tmp",
    logger: { log() {} },
    delegatedBindingSecretProvider: secretProvider,
    runtimeFactory(options) {
      runtimeOptions = options;
      return {
        app: { handleRequest() {} },
        host: "127.0.0.1",
        port: 0,
        descriptor: Object.freeze({ mode: "test" }),
      };
    },
    serverFactory: createServerFactory(),
  });

  assert.deepEqual(observedAccess, {
    secretRef: "secret://uni-juri/delegated-binding/private-key",
    purpose: "uni-juri.delegated-binding.sign",
  });

  const signer = runtimeOptions.delegatedBindingSigner;
  assert.ok(signer);
  assert.deepEqual(signer.configuredProducts, ["uni-juri"]);

  const proof = signer.signBinding({
    tenantId: "component.tenant.acme",
    workspaceId: "component.workspace.acme.juri-main",
    accessGrantId: "component.access.acme.main.juri.user",
    productId: "uni-juri",
    principalId: "component.principal.user",
  });

  assert.equal(proof.version, "uni-juri-delegated-binding/v1");
  assert.equal(proof.keyId, "uni-juri-binding-test");
  assert.equal(signer.signBinding({ productId: "zuni" }), null);
  assert.equal(signer.signBinding({ productId: "unknown" }), null);
});

test("operational gateway default delegated binding resolver remains deny-by-default when no product is configured", async () => {
  let runtimeOptions;

  await startOperationalGateway({
    env: {},
    cwd: "/tmp",
    logger: { log() {} },
    runtimeFactory(options) {
      runtimeOptions = options;
      return {
        app: { handleRequest() {} },
        host: "127.0.0.1",
        port: 0,
        descriptor: Object.freeze({ mode: "test" }),
      };
    },
    serverFactory: createServerFactory(),
  });

  assert.equal(Object.hasOwn(runtimeOptions, "delegatedBindingSigner"), false);
});
