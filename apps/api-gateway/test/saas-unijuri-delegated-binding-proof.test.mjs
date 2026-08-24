import test from "node:test";
import assert from "node:assert/strict";
import {
  constants as cryptoConstants,
  createPublicKey,
  generateKeyPairSync,
  verify as cryptoVerify,
} from "node:crypto";

import {
  createUniJuriDelegatedBindingSigner,
  UNIJURI_DELEGATED_BINDING_ALGORITHM,
  UNIJURI_DELEGATED_BINDING_AUDIENCE,
  UNIJURI_DELEGATED_BINDING_PRODUCT_ID,
  UNIJURI_DELEGATED_BINDING_VERSION,
} from "../src/saas-unijuri-delegated-binding-proof.mjs";

function createFixture() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const signer = createUniJuriDelegatedBindingSigner({
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
    keyId: "uni-juri-binding-test",
    clock: () => new Date("2026-08-24T19:00:00.000Z"),
    nonceFactory: () => "nonce-fixed",
    ttlSeconds: 60,
  });
  return { signer };
}

test("UniJuri delegated binding uses dedicated product, version and audience", () => {
  const { signer } = createFixture();
  const result = signer.signBinding({
    tenantId: "component.tenant.acme",
    workspaceId: "component.workspace.acme.juri-main",
    accessGrantId: "component.access.acme.main.juri.user",
    productId: UNIJURI_DELEGATED_BINDING_PRODUCT_ID,
    principalId: "component.principal.user",
  });

  assert.equal(result.version, UNIJURI_DELEGATED_BINDING_VERSION);
  assert.equal(result.algorithm, UNIJURI_DELEGATED_BINDING_ALGORITHM);
  assert.equal(result.keyId, "uni-juri-binding-test");
  assert.equal(result.expiresAt, "2026-08-24T19:01:00.000Z");

  const [payloadB64u, signatureB64u] = result.proof.split(".");
  const payload = JSON.parse(Buffer.from(payloadB64u, "base64url").toString("utf8"));

  assert.deepEqual(payload, {
    version: UNIJURI_DELEGATED_BINDING_VERSION,
    audience: UNIJURI_DELEGATED_BINDING_AUDIENCE,
    tenantId: "component.tenant.acme",
    workspaceId: "component.workspace.acme.juri-main",
    accessGrantId: "component.access.acme.main.juri.user",
    productId: "uni-juri",
    principalId: "component.principal.user",
    issuedAt: "2026-08-24T19:00:00.000Z",
    expiresAt: "2026-08-24T19:01:00.000Z",
    nonce: "nonce-fixed",
  });

  const verified = cryptoVerify(
    "sha256",
    Buffer.from(payloadB64u, "utf8"),
    {
      key: createPublicKey(signer.publicKeyPem),
      padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    },
    Buffer.from(signatureB64u, "base64url"),
  );
  assert.equal(verified, true);
});

test("UniJuri delegated binding refuses Zuni and other products", () => {
  const { signer } = createFixture();

  const base = {
    tenantId: "component.tenant.acme",
    workspaceId: "component.workspace.acme.juri-main",
    accessGrantId: "component.access.acme.main.juri.user",
    principalId: "component.principal.user",
  };

  assert.equal(signer.signBinding({ ...base, productId: "zuni" }), null);
  assert.equal(signer.signBinding({ ...base, productId: "other-product" }), null);
});
