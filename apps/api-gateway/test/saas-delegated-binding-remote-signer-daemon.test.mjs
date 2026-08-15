import test from "node:test";
import assert from "node:assert/strict";
import {
  constants as cryptoConstants,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";

import {
  ZUNI_DELEGATED_BINDING_ALGORITHM,
  ZUNI_DELEGATED_BINDING_AUDIENCE,
  ZUNI_DELEGATED_BINDING_VERSION,
} from "../src/saas-delegated-binding-proof.mjs";
import { ZUNI_REMOTE_SIGNER_VERSION } from "../src/saas-delegated-binding-remote-signer.mjs";
import {
  createZuniRemoteSignerService,
  startZuniRemoteSignerDaemon,
} from "../src/saas-delegated-binding-remote-signer-daemon.mjs";

const fixedNow = "2026-08-15T21:00:00.000Z";

function request(overrides = {}) {
  return {
    version: ZUNI_REMOTE_SIGNER_VERSION,
    operation: "sign-zuni-delegated-binding",
    keyId: "zuni-test-2026-08",
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
      issuedAt: fixedNow,
      expiresAt: "2026-08-15T21:01:00.000Z",
      nonce: "nonce-1",
    },
    timeoutMs: 1800,
    ...overrides,
  };
}

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const service = createZuniRemoteSignerService({
    keyId: "zuni-test-2026-08",
    clock: () => new Date(fixedNow),
    signPayload: async ({ payloadB64u }) =>
      cryptoSign(
        "sha256",
        Buffer.from(payloadB64u, "utf8"),
        { key: privateKey, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      ).toString("base64url"),
  });
  return { service, publicKey };
}

test("remote signer service signs only canonical delegated binding payloads", async () => {
  const { service, publicKey } = fixture();
  const signed = await service.sign(request());
  const [payloadB64u, signature] = signed.proof.split(".");
  const payload = JSON.parse(Buffer.from(payloadB64u, "base64url").toString("utf8"));

  assert.equal(signed.keyId, "zuni-test-2026-08");
  assert.equal(payload.workspaceId, "workspace.acme");
  assert.equal(
    cryptoVerify(
      "sha256",
      Buffer.from(payloadB64u, "utf8"),
      { key: publicKey, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      Buffer.from(signature, "base64url"),
    ),
    true,
  );
});

test("remote signer service rejects replay and denied audience", async () => {
  const { service } = fixture();
  await service.sign(request());
  await assert.rejects(() => service.sign(request()), /remote_signer_replay_detected/);

  const { service: fresh } = fixture();
  await assert.rejects(
    () => fresh.sign(request({ audience: "other-service" })),
    /remote_signer_audience_denied/,
  );
});

test("remote signer daemon exposes loopback health and sign endpoints without production secrets", async () => {
  const { service } = fixture();
  const daemon = await startZuniRemoteSignerDaemon({ service, host: "127.0.0.1", port: 0 });
  const { port } = daemon.address;

  try {
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      ok: true,
      service: "zuni-remote-signer",
      version: ZUNI_REMOTE_SIGNER_VERSION,
    });

    const signedResponse = await fetch(`http://127.0.0.1:${port}/v1/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request()),
    });
    assert.equal(signedResponse.status, 200);
    const signed = await signedResponse.json();
    assert.equal(signed.keyId, "zuni-test-2026-08");
    assert.equal(signed.version, ZUNI_DELEGATED_BINDING_VERSION);
  } finally {
    await daemon.close();
  }
});
