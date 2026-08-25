import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import { loadUniJuriDelegatedBindingSigner } from "../src/saas-unijuri-delegated-binding-secret-loader.mjs";

function createPrivateKeyPem() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" });
}

test("loads UniJuri delegated binding signer from opaque secret ref with dedicated purpose", async () => {
  const privateKeyPem = createPrivateKeyPem();
  let observedAccess = null;

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

  const signer = await loadUniJuriDelegatedBindingSigner({
    secretProvider,
    privateKeyRef: "vault://uni-juri/delegated-binding/private-key",
    keyId: "uni-juri-binding-test",
    clock: () => new Date("2026-08-25T14:00:00.000Z"),
    ttlSeconds: 60,
    nonceFactory: () => "nonce-unijuri-test",
  });

  assert.deepEqual(observedAccess, {
    secretRef: "vault://uni-juri/delegated-binding/private-key",
    purpose: "uni-juri.delegated-binding.sign",
  });
  assert.equal(signer.keyId, "uni-juri-binding-test");
  assert.match(signer.publicKeyPem, /BEGIN PUBLIC KEY/);

  const proof = signer.signBinding({
    tenantId: "component.tenant.acme",
    workspaceId: "component.workspace.acme.juri-main",
    accessGrantId: "component.access.acme.main.juri.user",
    productId: "uni-juri",
    principalId: "component.principal.user",
  });

  assert.equal(proof.version, "uni-juri-delegated-binding/v1");
  assert.equal(proof.keyId, "uni-juri-binding-test");
  assert.equal(proof.expiresAt, "2026-08-25T14:01:00.000Z");
});

test("rejects non-opaque UniJuri secret references before provider access", async () => {
  let providerCalled = false;
  const secretProvider = {
    async withSecret() {
      providerCalled = true;
      throw new Error("should not be called");
    },
  };

  await assert.rejects(
    () =>
      loadUniJuriDelegatedBindingSigner({
        secretProvider,
        privateKeyRef: "plain-text-or-path.pem",
        keyId: "k1",
      }),
    /approved opaque secret or vault reference/i,
  );

  assert.equal(providerCalled, false);
});

test("rejects missing secret ref or key id before provider access", async () => {
  const secretProvider = {
    async withSecret() {
      throw new Error("should not be called");
    },
  };

  await assert.rejects(
    () => loadUniJuriDelegatedBindingSigner({ secretProvider, keyId: "k1" }),
    /privateKeyRef is required/,
  );
  await assert.rejects(
    () =>
      loadUniJuriDelegatedBindingSigner({
        secretProvider,
        privateKeyRef: "secret://uni-juri/binding",
      }),
    /keyId is required/,
  );
});
