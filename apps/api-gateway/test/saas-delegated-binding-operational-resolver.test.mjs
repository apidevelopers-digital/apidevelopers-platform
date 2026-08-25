import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import { resolveProductAwareDelegatedBindingOperationalSigner } from "../src/saas-delegated-binding-operational-resolver.mjs";
import { startOperationalGateway } from "../src/operational-server.mjs";

function fakeResolution({ productId, proof, configured = true } = {}) {
  if (!configured) {
    return Object.freeze({
      configured: false,
      signer: null,
      descriptor: Object.freeze({
        configured: false,
        mode: "deny-by-default",
        productId,
      }),
    });
  }

  return Object.freeze({
    configured: true,
    signer: Object.freeze({
      signBinding(binding = {}) {
        return binding.productId === productId ? Object.freeze({ proof }) : null;
      },
    }),
    descriptor: Object.freeze({
      configured: true,
      mode: "test",
      productId,
    }),
  });
}

test("product-aware operational resolver is deny-by-default when neither product is configured", async () => {
  const calls = [];
  const env = Object.freeze({ TEST_ENV: "present" });
  const secretProvider = Object.freeze({ marker: "provider" });

  const result = await resolveProductAwareDelegatedBindingOperationalSigner({
    env,
    secretProvider,
    zuniResolver: async (options) => {
      calls.push(["zuni", options]);
      return fakeResolution({ productId: "zuni", configured: false });
    },
    uniJuriResolver: async (options) => {
      calls.push(["uni-juri", options]);
      return fakeResolution({ productId: "uni-juri", configured: false });
    },
  });

  assert.equal(result.configured, false);
  assert.equal(result.signer, null);
  assert.equal(result.descriptor.mode, "deny-by-default");
  assert.deepEqual(result.descriptor.configuredProducts, []);
  assert.equal(result.descriptor.privateKeyMaterialConfigured, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].env, env);
  assert.equal(calls[0][1].secretProvider, secretProvider);
  assert.equal(calls[1][1].env, env);
  assert.equal(calls[1][1].secretProvider, secretProvider);
});

test("product-aware operational resolver preserves Zuni when UniJuri is not configured", async () => {
  const result = await resolveProductAwareDelegatedBindingOperationalSigner({
    env: {},
    zuniResolver: async () =>
      fakeResolution({ productId: "zuni", proof: "zuni-proof" }),
    uniJuriResolver: async () =>
      fakeResolution({ productId: "uni-juri", configured: false }),
  });

  assert.equal(result.configured, true);
  assert.deepEqual(result.descriptor.configuredProducts, ["zuni"]);
  assert.equal(
    result.signer.signBinding({ productId: "zuni" }).proof,
    "zuni-proof",
  );
  assert.equal(
    result.signer.signBinding({ productId: "uni-juri" }),
    null,
  );
  assert.equal(
    result.signer.signBinding({ productId: "unknown" }),
    null,
  );
});

test("product-aware operational resolver routes Zuni and UniJuri independently when both are configured", async () => {
  const result = await resolveProductAwareDelegatedBindingOperationalSigner({
    env: {},
    zuniResolver: async () =>
      fakeResolution({ productId: "zuni", proof: "zuni-proof" }),
    uniJuriResolver: async () =>
      fakeResolution({ productId: "uni-juri", proof: "uni-juri-proof" }),
  });

  assert.equal(result.configured, true);
  assert.deepEqual(result.descriptor.configuredProducts, ["uni-juri", "zuni"]);
  assert.equal(
    result.signer.signBinding({ productId: "zuni" }).proof,
    "zuni-proof",
  );
  assert.equal(
    result.signer.signBinding({ productId: "uni-juri" }).proof,
    "uni-juri-proof",
  );
  assert.equal(
    result.signer.signBinding({ productId: "other-product" }),
    null,
  );
});

test("product-aware operational resolver rejects configured products without a signer contract", async () => {
  await assert.rejects(
    () =>
      resolveProductAwareDelegatedBindingOperationalSigner({
        env: {},
        zuniResolver: async () => ({
          configured: true,
          signer: null,
          descriptor: { configured: true },
        }),
        uniJuriResolver: async () =>
          fakeResolution({ productId: "uni-juri", configured: false }),
      }),
    /zuniResolver\.signer\.signBinding must be a function when configured/,
  );
});

test("existing operational gateway seam accepts the composed resolver with real UniJuri runtime contract while Zuni stays absent", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });

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

  const result = await startOperationalGateway({
    env,
    cwd: "/tmp",
    logger: { log() {} },
    delegatedBindingSecretProvider: secretProvider,
    delegatedBindingSignerResolver:
      resolveProductAwareDelegatedBindingOperationalSigner,
    runtimeFactory(options) {
      runtimeOptions = options;
      return {
        app: { handleRequest() {} },
        host: "127.0.0.1",
        port: 0,
        descriptor: Object.freeze({ mode: "test" }),
      };
    },
    serverFactory: async () => ({
      address() {
        return { address: "127.0.0.1", port: 3000 };
      },
    }),
  });

  assert.ok(result);
  assert.equal(observedAccess.secretRef, env.UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_REF);
  assert.equal(observedAccess.purpose, "uni-juri.delegated-binding.sign");

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
});
