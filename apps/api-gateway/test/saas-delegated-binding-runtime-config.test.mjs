import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveZuniDelegatedBindingRuntimeConfig,
  resolveZuniDelegatedBindingSigner,
} from "../src/saas-delegated-binding-runtime-config.mjs";

test("runtime binding config is deny-by-default when no ref is configured", () => {
  const config = resolveZuniDelegatedBindingRuntimeConfig({});
  assert.equal(config.configured, false);
  assert.equal(config.reason, "zuni_delegated_binding_not_configured");
});

test("runtime binding config rejects direct private key material", () => {
  assert.throws(
    () => resolveZuniDelegatedBindingRuntimeConfig({
      ZUNI_DELEGATED_BINDING_PRIVATE_KEY_PEM: "-----BEGIN PRIVATE KEY-----",
    }),
    /opaque secret reference/i,
  );
});

test("runtime binding config requires ref and key id together", () => {
  assert.throws(
    () => resolveZuniDelegatedBindingRuntimeConfig({
      ZUNI_DELEGATED_BINDING_PRIVATE_KEY_REF: "vault://zuni/binding",
    }),
    /requires private key ref and key id together/i,
  );
});

test("runtime binding signer resolves only from opaque ref", async () => {
  let observed = null;
  const fakeSigner = Object.freeze({ signBinding() { return {}; } });
  const result = await resolveZuniDelegatedBindingSigner({
    env: {
      ZUNI_DELEGATED_BINDING_PRIVATE_KEY_REF: "vault://zme/binding",
      ZUNI_DELEGATED_BINDING_KEY_ID: "zuni-binding-2026-08",
      ZUNI_DELEGATED_BINDING_TTL_SECONDS: "90",
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
  assert.equal(result.descriptor.privateKeyMaterialConfigured, false);
  assert.equal(result.descriptor.privateKeyReferenceConfigured, true);
  assert.equal(result.descriptor.keyId, "zuni-binding-2026-08");
  assert.equal(result.descriptor.ttlSeconds, 90);
  assert.equal(observed.privateKeyRef, "vault://zme/binding");
  assert.equal(observed.keyId, "zuni-binding-2026-08");
  assert.equal(observed.ttlSeconds, 90);
});

test("runtime binding config enforces bounded TTL", () => {
  assert.throws(
    () => resolveZuniDelegatedBindingRuntimeConfig({
      ZUNI_DELEGATED_BINDING_PRIVATE_KEY_REF: "vault://zuni/binding",
      ZUNI_DELEGATED_BINDING_KEY_ID: "zuni-binding-2026-08",
      ZUNI_DELEGATED_BINDING_TTL_SECONDS: "301",
    }),
    /between 15 and 300/i,
  );
});
