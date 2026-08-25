import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveUniJuriDelegatedBindingRuntimeConfig,
  resolveUniJuriDelegatedBindingSigner,
} from "../src/saas-unijuri-delegated-binding-runtime-config.mjs";

test("UniJuri runtime binding config is deny-by-default when no ref is configured", () => {
  const config = resolveUniJuriDelegatedBindingRuntimeConfig({});
  assert.equal(config.configured, false);
  assert.equal(config.reason, "unijuri_delegated_binding_not_configured");
});

test("UniJuri runtime binding config rejects direct private key material", () => {
  assert.throws(
    () =>
      resolveUniJuriDelegatedBindingRuntimeConfig({
        UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_PEM: "-----BEGIN PRIVATE KEY-----",
      }),
    /opaque secret reference/i,
  );
});

test("UniJuri runtime binding config requires an approved opaque secret reference", () => {
  assert.throws(
    () =>
      resolveUniJuriDelegatedBindingRuntimeConfig({
        UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_REF: "/tmp/private-key.pem",
        UNIJURI_DELEGATED_BINDING_KEY_ID: "uni-juri-binding-2026-08",
      }),
    /approved opaque secret or vault reference/i,
  );
});

test("UniJuri runtime binding config requires ref and key id together", () => {
  assert.throws(
    () =>
      resolveUniJuriDelegatedBindingRuntimeConfig({
        UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_REF: "vault://uni-juri/binding",
      }),
    /requires private key ref and key id together/i,
  );
});

test("UniJuri runtime binding signer resolves only from opaque ref without key material in descriptor", async () => {
  let observed = null;
  const fakeSigner = Object.freeze({
    signBinding() {
      return {};
    },
  });

  const result = await resolveUniJuriDelegatedBindingSigner({
    env: {
      UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_REF: "secret://uni-juri/delegated-binding",
      UNIJURI_DELEGATED_BINDING_KEY_ID: "uni-juri-binding-2026-08",
      UNIJURI_DELEGATED_BINDING_TTL_SECONDS: "90",
    },
    secretProvider: { withSecret() {} },
    loader: async (options) => {
      observed = options;
      return fakeSigner;
    },
  });

  assert.equal(result.configured, true);
  assert.equal(result.signer, fakeSigner);
  assert.equal(result.descriptor.mode, "secret-reference");
  assert.equal(result.descriptor.productId, "uni-juri");
  assert.equal(result.descriptor.purpose, "uni-juri.delegated-binding.sign");
  assert.equal(result.descriptor.privateKeyMaterialConfigured, false);
  assert.equal(result.descriptor.privateKeyReferenceConfigured, true);
  assert.equal(result.descriptor.keyId, "uni-juri-binding-2026-08");
  assert.equal(result.descriptor.ttlSeconds, 90);
  assert.equal(observed.privateKeyRef, "secret://uni-juri/delegated-binding");
  assert.equal(observed.keyId, "uni-juri-binding-2026-08");
  assert.equal(observed.ttlSeconds, 90);
});

test("UniJuri runtime binding config enforces bounded TTL", () => {
  assert.throws(
    () =>
      resolveUniJuriDelegatedBindingRuntimeConfig({
        UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_REF: "vault://uni-juri/binding",
        UNIJURI_DELEGATED_BINDING_KEY_ID: "uni-juri-binding-2026-08",
        UNIJURI_DELEGATED_BINDING_TTL_SECONDS: "301",
      }),
    /between 15 and 300/i,
  );
});

test("UniJuri runtime signer does not require secret provider when unconfigured", async () => {
  const result = await resolveUniJuriDelegatedBindingSigner({ env: {} });

  assert.equal(result.configured, false);
  assert.equal(result.signer, null);
  assert.equal(result.descriptor.mode, "deny-by-default");
  assert.equal(result.descriptor.privateKeyMaterialConfigured, false);
});
