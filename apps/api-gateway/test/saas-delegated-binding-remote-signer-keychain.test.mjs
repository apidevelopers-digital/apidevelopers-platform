import test from "node:test";
import assert from "node:assert/strict";
import {
  constants as cryptoConstants,
  generateKeyPairSync,
  verify as cryptoVerify,
} from "node:crypto";

import {
  ZUNI_DELEGATED_BINDING_ALGORITHM,
  ZUNI_DELEGATED_BINDING_AUDIENCE,
  ZUNI_DELEGATED_BINDING_VERSION,
} from "../src/saas-delegated-binding-proof.mjs";
import {
  ZUNI_REMOTE_SIGNER_VERSION,
} from "../src/saas-delegated-binding-remote-signer.mjs";
import {
  ZUNI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
  ZUNI_REMOTE_SIGNER_KEYCHAIN_PURPOSE,
  ZUNI_REMOTE_SIGNER_KEYCHAIN_SECRET_REF,
  ZUNI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
  createZuniRemoteSignerKeychainService,
} from "../src/saas-delegated-binding-remote-signer-keychain.mjs";

const FIXED_NOW = new Date("2026-08-16T00:15:00.000Z");

function makeRequest(overrides = {}) {
  return {
    version: ZUNI_REMOTE_SIGNER_VERSION,
    operation: "sign-zuni-delegated-binding",
    keyId: "zuni-test-key-2026-08",
    algorithm: ZUNI_DELEGATED_BINDING_ALGORITHM,
    audience: ZUNI_DELEGATED_BINDING_AUDIENCE,
    payload: {
      version: ZUNI_DELEGATED_BINDING_VERSION,
      audience: ZUNI_DELEGATED_BINDING_AUDIENCE,
      tenantId: "tenant.acme",
      workspaceId: "workspace.acme",
      accessGrantId: "grant.acme",
      productId: "zuni",
      principalId: "principal.user",
      issuedAt: "2026-08-16T00:15:00.000Z",
      expiresAt: "2026-08-16T00:16:00.000Z",
      nonce: "nonce-keychain-1",
    },
    timeoutMs: 1800,
    ...overrides,
  };
}

test("keychain adapter signs a canonical binding using only a short-lived lease", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const sourceBytes = Buffer.from(pem);
  let descriptor;
  let leasedBytes;

  const service = createZuniRemoteSignerKeychainService({
    keyId: "zuni-test-key-2026-08",
    clock: () => FIXED_NOW,
    keychainReader: async (value) => {
      descriptor = value;
      return { bytes: sourceBytes, version: "synthetic-test-v1" };
    },
  });

  const signed = await service.sign(makeRequest());
  const [payloadB64u, signatureB64u] = signed.proof.split(".");
  leasedBytes = Buffer.from(payloadB64u, "base64url");

  assert.deepEqual(descriptor, {
    service: ZUNI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
    account: ZUNI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
  });
  assert.equal(signed.keyId, "zuni-test-key-2026-08");
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
  assert.equal(sourceBytes.every((value) => value === 0), true);
  assert.equal(leasedBytes.length > 0, true);
});

test("keychain adapter uses dedicated ref and purpose and rejects weak RSA", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  let calls = 0;

  const service = createZuniRemoteSignerKeychainService({
    keyId: "zuni-test-key-2026-08",
    clock: () => FIXED_NOW,
    keychainReader: async () => {
      calls += 1;
      return { bytes: Buffer.from(pem), version: "synthetic-test-v1" };
    },
  });

  await assert.rejects(
    () => service.sign(makeRequest()),
    /remote_signer_keychain_private_key_too_small/,
  );
  assert.equal(calls, 1);
  assert.equal(ZUNI_REMOTE_SIGNER_KEYCHAIN_SECRET_REF, "vault://zuni/delegated-binding/private-key");
  assert.equal(ZUNI_REMOTE_SIGNER_KEYCHAIN_PURPOSE, "zuni.delegated-binding.sign");
});

test("keychain adapter fails closed when Keychain is unavailable", async () => {
  const service = createZuniRemoteSignerKeychainService({
    keyId: "zuni-test-key-2026-08",
    clock: () => FIXED_NOW,
    keychainReader: async () => {
      throw new Error("PRIVATE KEY MATERIAL MUST NOT ESCAPE");
    },
  });

  await assert.rejects(
    () => service.sign(makeRequest()),
    (error) => {
      assert.equal(error.code, "keychain_unavailable");
      assert.equal(error.message, "macOS Keychain is unavailable");
      assert.equal(JSON.stringify(error).includes("PRIVATE KEY MATERIAL"), false);
      return true;
    },
  );
});

test("keychain adapter rejects non-RSA private keys", async () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });

  const service = createZuniRemoteSignerKeychainService({
    keyId: "zuni-test-key-2026-08",
    clock: () => FIXED_NOW,
    keychainReader: async () => ({ bytes: Buffer.from(pem) }),
  });

  await assert.rejects(
    () => service.sign(makeRequest()),
    /remote_signer_keychain_private_key_type_denied/,
  );
});
