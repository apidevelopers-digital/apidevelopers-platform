import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveUniJuriDelegatedBindingRuntimeConfig,
  resolveUniJuriDelegatedBindingSigner,
} from "../src/saas-unijuri-delegated-binding-runtime-config.mjs";

test("UniJuri remote runtime remains deny-by-default when unconfigured", () => {
  const config = resolveUniJuriDelegatedBindingRuntimeConfig({});
  assert.equal(config.configured, false);
  assert.equal(config.reason, "unijuri_delegated_binding_not_configured");
});

test("UniJuri remote runtime requires endpoint and key id together", () => {
  assert.throws(
    () =>
      resolveUniJuriDelegatedBindingRuntimeConfig({
        UNIJURI_DELEGATED_BINDING_SIGNER_MODE: "remote",
        UNIJURI_DELEGATED_BINDING_KEY_ID: "unijuri-binding-test",
      }),
    /remote signer endpoint and key id together/i,
  );
});

test("UniJuri remote runtime rejects private key references", () => {
  assert.throws(
    () =>
      resolveUniJuriDelegatedBindingRuntimeConfig({
        UNIJURI_DELEGATED_BINDING_SIGNER_MODE: "remote",
        UNIJURI_DELEGATED_BINDING_REMOTE_SIGNER_ENDPOINT:
          "https://signer.example.test/v1/unijuri/delegated-binding/sign",
        UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_REF:
          "vault://uni-juri/delegated-binding/private-key",
        UNIJURI_DELEGATED_BINDING_KEY_ID: "unijuri-binding-test",
      }),
    /must not configure a private key ref/i,
  );
});

test("UniJuri remote runtime resolves only with injected credential provider", async () => {
  const env = {
    UNIJURI_DELEGATED_BINDING_SIGNER_MODE: "remote",
    UNIJURI_DELEGATED_BINDING_REMOTE_SIGNER_ENDPOINT:
      "https://signer.example.test/v1/unijuri/delegated-binding/sign",
    UNIJURI_DELEGATED_BINDING_KEY_ID: "unijuri-binding-test",
    UNIJURI_DELEGATED_BINDING_TTL_SECONDS: "90",
  };

  await assert.rejects(
    resolveUniJuriDelegatedBindingSigner({ env }),
    /credential provider is required/i,
  );

  let transportOptions;
  let signerOptions;
  const fakeTransport = Object.freeze({ sign() {} });
  const fakeSigner = Object.freeze({ async signBinding() { return {}; } });

  const resolved = await resolveUniJuriDelegatedBindingSigner({
    env,
    credentialProvider: async () => ({
      scheme: "bearer",
      bytes: Buffer.from("0123456789abcdef-test-token"),
    }),
    remoteTransportFactory(options) {
      transportOptions = options;
      return fakeTransport;
    },
    remoteSignerFactory(options) {
      signerOptions = options;
      return fakeSigner;
    },
  });

  assert.equal(resolved.configured, true);
  assert.equal(resolved.signer, fakeSigner);
  assert.equal(resolved.descriptor.mode, "remote");
  assert.equal(resolved.descriptor.productId, "uni-juri");
  assert.equal(
    resolved.descriptor.purpose,
    "uni-juri.delegated-binding.remote-signer",
  );
  assert.equal(resolved.descriptor.keyId, "unijuri-binding-test");
  assert.equal(resolved.descriptor.ttlSeconds, 90);
  assert.equal(resolved.descriptor.remoteEndpointConfigured, true);
  assert.equal(resolved.descriptor.privateKeyReferenceConfigured, false);
  assert.equal(resolved.descriptor.privateKeyMaterialConfigured, false);

  assert.equal(
    transportOptions.endpoint,
    "https://signer.example.test/v1/unijuri/delegated-binding/sign",
  );
  assert.equal(typeof transportOptions.credentialProvider, "function");
  assert.equal(signerOptions.keyId, "unijuri-binding-test");
  assert.equal(signerOptions.transport, fakeTransport);
  assert.equal(signerOptions.ttlSeconds, 90);
});
