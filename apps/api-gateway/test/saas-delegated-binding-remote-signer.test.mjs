import test from "node:test";
import assert from "node:assert/strict";
import {
  constants as cryptoConstants,
  generateKeyPairSync,
  sign as cryptoSign,
} from "node:crypto";

import {
  ZUNI_DELEGATED_BINDING_ALGORITHM,
  ZUNI_DELEGATED_BINDING_VERSION,
} from "../src/saas-delegated-binding-proof.mjs";
import {
  ZUNI_REMOTE_SIGNER_VERSION,
  createZuniRemoteBindingSigner,
} from "../src/saas-delegated-binding-remote-signer.mjs";

function makeTransport({ privateKey, mutateResponse } = {}) {
  return {
    async sign(request) {
      const payloadB64u = Buffer.from(JSON.stringify(request.payload)).toString("base64url");
      const signature = cryptoSign(
        "sha256",
        Buffer.from(payloadB64u, "utf8"),
        {
          key: privateKey,
          padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
          saltLength: 32,
        },
      ).toString("base64url");

      const response = {
        version: ZUNI_DELEGATED_BINDING_VERSION,
        algorithm: ZUNI_DELEGATED_BINDING_ALGORITHM,
        keyId: request.keyId,
        proof: `${payloadB64u}.${signature}`,
        expiresAt: request.payload.expiresAt,
      };
      return mutateResponse ? mutateResponse(response, request) : response;
    },
  };
}

const binding = Object.freeze({
  tenantId: "component.tenant.acme",
  workspaceId: "component.workspace.acme.zuni-main",
  accessGrantId: "component.access.acme.main.zuni.user",
  productId: "zuni",
  principalId: "component.principal.user",
});

test("remote signer builds deterministic short-lived request and accepts valid proof envelope", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  let captured;
  const transport = makeTransport({ privateKey });
  const signer = createZuniRemoteBindingSigner({
    keyId: "zuni-binding-2026-08",
    transport: {
      async sign(request) {
        captured = request;
        return transport.sign(request);
      },
    },
    clock: () => new Date("2026-08-15T18:00:00.000Z"),
    ttlSeconds: 60,
    nonceFactory: () => "nonce-remote-123",
    timeoutMs: 1800,
  });

  const signed = await signer.signBinding(binding);

  assert.equal(signer.mode, "remote");
  assert.equal(signer.version, ZUNI_REMOTE_SIGNER_VERSION);
  assert.equal(captured.operation, "sign-zuni-delegated-binding");
  assert.equal(captured.keyId, "zuni-binding-2026-08");
  assert.equal(captured.timeoutMs, 1800);
  assert.equal(captured.payload.issuedAt, "2026-08-15T18:00:00.000Z");
  assert.equal(captured.payload.expiresAt, "2026-08-15T18:01:00.000Z");
  assert.equal(captured.payload.nonce, "nonce-remote-123");
  assert.equal(signed.keyId, "zuni-binding-2026-08");
  assert.equal(signed.expiresAt, "2026-08-15T18:01:00.000Z");
  assert.equal(signed.proof.split(".").length, 2);
});

test("remote signer fails closed when transport is unavailable", async () => {
  const signer = createZuniRemoteBindingSigner({
    keyId: "kid",
    transport: {
      async sign() {
        throw new Error("socket details must not escape");
      },
    },
  });

  await assert.rejects(
    () => signer.signBinding(binding),
    (error) => error.message === "remote_signer_unavailable",
  );
});

test("remote signer rejects proof whose payload differs from requested binding", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const signer = createZuniRemoteBindingSigner({
    keyId: "kid",
    transport: makeTransport({
      privateKey,
      mutateResponse(response) {
        const [payloadB64u, signature] = response.proof.split(".");
        const payload = JSON.parse(Buffer.from(payloadB64u, "base64url").toString("utf8"));
        payload.workspaceId = "component.workspace.other";
        return {
          ...response,
          proof: `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`,
        };
      },
    }),
    clock: () => new Date("2026-08-15T18:00:00.000Z"),
    nonceFactory: () => "nonce-1",
  });

  await assert.rejects(
    () => signer.signBinding(binding),
    /remote_signer_payload_mismatch:workspaceId/,
  );
});

test("remote signer validates ttl, timeout and transport contract", () => {
  assert.throws(
    () => createZuniRemoteBindingSigner({ keyId: "kid", transport: {} }),
    /transport\.sign must be a function/,
  );
  assert.throws(
    () =>
      createZuniRemoteBindingSigner({
        keyId: "kid",
        transport: { sign() {} },
        ttlSeconds: 5,
      }),
    /ttlSeconds/,
  );
  assert.throws(
    () =>
      createZuniRemoteBindingSigner({
        keyId: "kid",
        transport: { sign() {} },
        timeoutMs: 20,
      }),
    /timeoutMs/,
  );
});
