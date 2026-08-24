import test from "node:test";
import assert from "node:assert/strict";

import { createProductAwareDelegatedBindingSigner } from "../src/saas-delegated-binding-product-router.mjs";
import { startOperationalGateway } from "../src/operational-server.mjs";

test("product-aware delegated binding routes Zuni and UniJuri without cross-product proofs", () => {
  const zuniCalls = [];
  const juriCalls = [];

  const signer = createProductAwareDelegatedBindingSigner({
    zuniSigner: {
      signBinding(binding) {
        zuniCalls.push(binding);
        return { version: "zuni-delegated-binding/v1", proof: "zuni-proof" };
      },
    },
    uniJuriSigner: {
      signBinding(binding) {
        juriCalls.push(binding);
        return {
          version: "uni-juri-delegated-binding/v1",
          proof: "uni-juri-proof",
        };
      },
    },
  });

  assert.deepEqual(signer.configuredProducts, ["uni-juri", "zuni"]);

  const zuni = signer.signBinding({
    productId: "zuni",
    principalId: "component.principal.zuni-user",
  });
  const juri = signer.signBinding({
    productId: "uni-juri",
    principalId: "component.principal.juri-user",
  });

  assert.equal(zuni.version, "zuni-delegated-binding/v1");
  assert.equal(juri.version, "uni-juri-delegated-binding/v1");
  assert.equal(zuniCalls.length, 1);
  assert.equal(juriCalls.length, 1);

  assert.equal(signer.signBinding({ productId: "other-product" }), null);
  assert.equal(signer.signBinding({}), null);
  assert.equal(zuniCalls.length, 1);
  assert.equal(juriCalls.length, 1);
});

test("product-aware delegated binding rejects invalid signer contracts", () => {
  assert.throws(
    () => createProductAwareDelegatedBindingSigner({ uniJuriSigner: {} }),
    /uniJuriSigner\.signBinding must be a function/,
  );
});

test("operational gateway accepts a product-aware resolver while remaining env-secret-free", async () => {
  let runtimeOptions;

  const zuniSigner = {
    signBinding(binding) {
      return binding.productId === "zuni" ? { proof: "zuni" } : null;
    },
  };
  const uniJuriSigner = {
    signBinding(binding) {
      return binding.productId === "uni-juri" ? { proof: "uni-juri" } : null;
    },
  };

  const productAwareSigner = createProductAwareDelegatedBindingSigner({
    zuniSigner,
    uniJuriSigner,
  });

  const result = await startOperationalGateway({
    env: {},
    cwd: "/tmp",
    logger: { log() {} },
    delegatedBindingSignerResolver: async ({ env, secretProvider }) => {
      assert.deepEqual(env, {});
      assert.equal(secretProvider, undefined);
      return {
        configured: true,
        signer: productAwareSigner,
        descriptor: Object.freeze({
          configured: true,
          mode: "injected-test-only",
          products: productAwareSigner.configuredProducts,
        }),
      };
    },
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
  assert.equal(
    runtimeOptions.delegatedBindingSigner.signBinding({ productId: "zuni" }).proof,
    "zuni",
  );
  assert.equal(
    runtimeOptions.delegatedBindingSigner.signBinding({ productId: "uni-juri" }).proof,
    "uni-juri",
  );
  assert.equal(
    runtimeOptions.delegatedBindingSigner.signBinding({ productId: "unknown" }),
    null,
  );
});
