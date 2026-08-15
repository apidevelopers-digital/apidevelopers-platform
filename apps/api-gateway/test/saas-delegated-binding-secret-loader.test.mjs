import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import { loadZuniDelegatedBindingSigner } from "../src/saas-delegated-binding-secret-loader.mjs";

function createPrivateKeyPem() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" });
}

test("loads delegated binding signer from opaque secret ref without exposing key material", async () => {
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

  const signer = await loadZuniDelegatedBindingSigner({
    secretProvider,
    privateKeyRef: "vault://zuni/delegated-binding-private-key",
    keyId: "zuni-binding-2026-08",
    clock: () => new Date("2026-08-15T09:17:00.000Z"),
    ttlSeconds: 60,
    nonceFactory: () => "nonce-123",
  });

  assert.deepEqual(observedAccess, {
    secretRef: "vault://zuni/delegated-binding-private-key",
    purpose: "zuni.delegated-binding.sign",
  });
  assert.equal(signer.keyId, "zuni-binding-2026-08");
  assert.match(signer.publicKeyPem, /BEGIN PUBLIC KEY/);
  const proof = signer.signBinding({
    tenantId: "component.tenant.acme",
    workspaceId: "component.workspace.acme.zuni-main",
    accessGrantId: "component.access.acme.main.zuni.user",
    productId: "zuni",
    principalId: "component.principal.user",
  });
  assert.equal(proof.keyId, "zuni-binding-2026-08");
  assert.equal(proof.expiresAt, "2026-08-15T09:18:00.000Z");
  assert.match(proof.proof, /^%?/);
});

test("rejects missing secret ref or key id before provider access", async () => {
  const secretProvider = {
    async withSecret() {
      throw new Error("should not be called");
    },
  };

  await assert.rejects(
    () => loadZuniDelegatedBindingSigner({ secretProvider, keyId: "k1" }),
    /privateKeyRef is required/,
  );
  await assert.rejects(
    () => loadZuniDelegatedBindingSigner({ secretProvider, privateKeyRef: "vault://zc/key" }),
    /keyId is required/,
  );
});
