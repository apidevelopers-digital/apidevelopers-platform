import test from "node:test";
import assert from "node:assert/strict";
import {
  constants as cryptoConstants,
  generateKeyPairSync,
  verify as cryptoVerify,
} from "node:crypto";

import {
  ZUNI_DELEGATED_BINDING_AUDIENCE,
  ZUNI_DELEGATED_BINDING_ALGORITHM,
  createZuniDelegatedBindingSigner,
} from "../src/saas-delegated-binding-proof.mjs";

function keyPair() {
  return generateKeyPairSync("rsa", { modulusLength: 2048 });
}

test("signs short-lived canonical Zuni delegated binding proof", () => {
  const { privateKey, publicKey } = keyPair();
  const signer = createZuniDelegatedBindingSigner({
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
    keyId: "zuni-binding-2026-08",
    clock: () => new Date("2026-08-15T06:00:00.000Z"),
    ttlSeconds: 60,
    nonceFactory: () => "nonce-123",
  });

  const signed = signer.signBinding({
    tenantId: "component.tenant.acme",
    workspaceId: "component.workspace.acme.zuni-main",
    accessGrantId: "component.access.acme.main.zuni.user",
    productId: "zuni",
    principalId: "component.principal.user",
  });

  assert.equal(signed.algorithm, ZUNI_DELEGATED_BINDING_ALGORITHM);
  assert.equal(signed.keyId, "zuni-binding-2026-08");
  assert.equal(signed.expiresAt, "2026-08-15T06:01:00.000Z");

  const [payloadB64u, signatureB64u] = signed.proof.split(".");
  const payload = JSON.parse(Buffer.from(payloadB64u, "base64url").toString("utf8"));
  assert.equal(payload.audience, ZUNI_DELEGATED_BINDING_AUDIENCE);
  assert.equal(payload.productId, "zuni");
  assert.equal(payload.nonce, "nonce-123");
  assert.equal(payload.issuedAt, "2026-08-15T06:00:00.000Z");
  assert.equal(payload.expiresAt, "2026-08-15T06:01:00.000Z");

  assert.equal(
    cryptoVerify(
      "sha256",
      Buffer.from(payloadB64u, "utf8"),
      {
        key: publicKey,
        padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32,
      },
      Buffer.from(signatureB64u, "base64url"),
    ),
    true,
  );
});

test("rejects weak ttl and non-RSA key material", () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  assert.throws(
    () => createZuniDelegatedBindingSigner({
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
      keyId: "bad",
    }),
    /must be RSA/,
  );
});
