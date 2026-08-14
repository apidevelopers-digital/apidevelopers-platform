import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  TRUST_EVALUATION_CREDENTIAL_ENVELOPE_ALGORITHM,
  TRUST_EVALUATION_CREDENTIAL_ENVELOPE_VERSION,
  createTrustEvaluationCredentialEnvelopeHandoff,
  openTrustEvaluationCredentialEnvelope,
} from "../src/global-trust-evaluation-credential-envelope.mjs";

const SYNTHETIC_SECRET =
  "trust_eval_synthetic_0123456789abcdefghijklmnopqrstuvwxyz";

function rsaPair(modulusLength = 2048) {
  return generateKeyPairSync("rsa", {
    modulusLength,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function payload() {
  return {
    secret: SYNTHETIC_SECRET,
    tenantId: "component.tenant.acme",
    apiKeyId: "apikey-evaluation-acme",
    expiresAt: "2026-08-28T09:00:00.000Z",
    correlationId: "corr-evaluation-handoff-001",
  };
}

function handoff(publicKey, sink) {
  return createTrustEvaluationCredentialEnvelopeHandoff({
    recipientPublicKey: publicKey,
    deliverEnvelope: sink,
  });
}

async function sealed(keys = rsaPair()) {
  let envelope;
  const adapter = handoff(keys.publicKey, async (value) => {
    envelope = structuredClone(value);
  });
  const receipt = await adapter.deliver(payload());
  return { keys, envelope, receipt };
}

test("sealed envelope round-trips only for the recipient and never serializes plaintext", async () => {
  const { keys, envelope, receipt } = await sealed();

  assert.equal(envelope.version, TRUST_EVALUATION_CREDENTIAL_ENVELOPE_VERSION);
  assert.equal(envelope.algorithm, TRUST_EVALUATION_CREDENTIAL_ENVELOPE_ALGORITHM);
  assert.equal(receipt.mode, "sealed_envelope");
  assert.equal(receipt.recipientKeyFingerprint, envelope.recipientKeyFingerprint);
  assert.equal(receipt.contextDigestB64u, envelope.contextDigestB64u);
  assert.equal(
    openTrustEvaluationCredentialEnvelope({
      envelope,
      recipientPrivateKey: keys.privateKey,
    }),
    SYNTHETIC_SECRET,
  );

  const serialized = JSON.stringify(envelope);
  assert.equal(serialized.includes(SYNTHETIC_SECRET), false);
  assert.equal(serialized.includes("PRIVATE KEY"), false);
});

test("tampered context fails closed", async () => {
  const { keys, envelope } = await sealed();
  envelope.context.tenantId = "component.tenant.attacker";

  assert.throws(
    () =>
      openTrustEvaluationCredentialEnvelope({
        envelope,
        recipientPrivateKey: keys.privateKey,
      }),
    (error) => error.code === "TRUST_EVALUATION_ENVELOPE_CONTEXT_MISMATCH",
  );
});

test("wrong recipient fails closed", async () => {
  const { envelope } = await sealed();
  const other = rsaPair();

  assert.throws(
    () =>
      openTrustEvaluationCredentialEnvelope({
        envelope,
        recipientPrivateKey: other.privateKey,
      }),
    (error) => error.code === "TRUST_EVALUATION_ENVELOPE_RECIPIENT_MISMATCH",
  );
});

test("private and weak recipient keys are rejected", () => {
  const strong = rsaPair();
  assert.throws(
    () => handoff(strong.privateKey, async () => {}),
    (error) => error.code === "TRUST_EVALUATION_ENVELOPE_PRIVATE_KEY_REJECTED",
  );

  const weak = rsaPair(1024);
  assert.throws(
    () => handoff(weak.publicKey, async () => {}),
    (error) => error.code === "TRUST_EVALUATION_ENVELOPE_WEAK_PUBLIC_KEY",
  );
});

test("delivery sink failure propagates for recovery handling", async () => {
  const keys = rsaPair();
  const sinkError = new Error("synthetic sink unavailable");
  const adapter = handoff(keys.publicKey, async () => {
    throw sinkError;
  });

  await assert.rejects(adapter.deliver(payload()), (error) => error === sinkError);
});

test("non-canonical base64url fails closed", async () => {
  const { keys, envelope } = await sealed();
  envelope.contextDigestB64u += "=";

  assert.throws(
    () =>
      openTrustEvaluationCredentialEnvelope({
        envelope,
        recipientPrivateKey: keys.privateKey,
      }),
    (error) => error.code === "TRUST_EVALUATION_ENVELOPE_INVALID_ENCODING",
   );
});
