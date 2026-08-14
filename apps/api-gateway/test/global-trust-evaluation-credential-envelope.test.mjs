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

function payload(secret = SYNTHETIC_SECRET) {
  return {
    secret,
    tenantId: "component.tenant.acme",
    apiKeyId: "apikey-evaluation-acme",
    expiresAt: "2026-08-28T09:00:00.000Z",
    correlationId: "corr-evaluation-handoff-001",
  };
}

test("sealed envelope encrypts first-issued credential for the recipient public key", async () => {
  const keys = rsaPair();
  const envelopes = [];
  const handoff = createTrustEvaluationCredentialEnvelopeHandoff({
    recipientPublicKey: keys.publicKey,
    async deliverEnvelope(envelope) {
      envelopes.push(structuredClone(envelope));
    },
  });

  const receipt = await handoff.deliver(payload());

  assert.equal(envelopes.length, 1);
  const [envelope] = envelopes;
  assert.equal(envelope.version, TRUST_EVALUATION_CREDENTIAL_ENVELOPE_VERSION);
  assert.equal(envelope.algorithm, TRUST_EVALUATION_CREDENTIAL_ENVELOPE_ALGORITHM);
  assert.equal(receipt.mode, "sealed_envelope");
  assert.equal(receipt.recipientKeyFingerprint, envelope.recipientKeyFingerprint);
  assert.equal(receipt.contextDigestB64u, envelope.contextDigestB64u);
  assert.equal(envelope.context.tenantId, payload().tenantId);
  assert.equal(envelope.context.apiKeyId, payload().apiKeyId);
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

test("tampered envelope context fails closed before decryption", async () => {
  const keys = rsaPair();
  let envelope;
  const handoff = createTrustEvaluationCredentialEnvelopeHandoff({
    recipientPublicKey: keys.publicKey,
    async deliverEnvelope(value) {
      envelope = structuredClone(value);
    },
  });
  await handoff.deliver(payload());

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

test("wrong private key cannot open the envelope", async () => {
  const recipient = rsaPair();
  const other = rsaPair();
  let envelope;
  const handoff = createTrustEvaluationCredentialEnvelopeHandoff({
    recipientPublicKey: recipient.publicKey,
    async deliverEnvellope(value) {
      envelope = structuredClone(value);
    },
  });
  await handoff.deliver(payload());

  assert.throws(
    () =>
      openTrustEvaluationCredentialEnvelope({
        envelope,
        recipientPrivateKey: other.privateKey,
      }),
    (error) => error.code === "TRUST_EVALUATION_ENVELOPE_RECIPIENT_MISMATCH",
  );
});

test("recipient public-key boundary rejects private and weak keys", () => {
  const strong = rsaPair();
  assert.throws(
    () =>
      createTrustEvaluationCredentialEnvelopeHandoff({
        recipientPublicKey: strong.privateKey,
        async deliverEnvellope() {},
      }),
    (error) => error.code === "TRUST_EVALUATION_ENVELOPE_PRIVATE_KEY_REJECTED",
  );

  const weak = rsaPair(1024);
  assert.throws(
    () =>
      createTrustEvaluationCredentialEnvelopeHandoff({
        recipientPublicKey: weak.publicKey,
        async deliverEnvelope() {},
      }),
    (error) => error.code === "TRUST_EVALUATION_ENVELOPE_WEAK_PUBLIC_KEY",
  );
});

test("delivery sink failure propagates so provisioning can require recovery", async () => {
  const keys = rsaPair();
  const sinkError = new Error("synthetic sink unavailable");
  const handoff = createTrustEvaluationCredentialEnvelopeHandoff({
    recipientPublicKey: keys.publicKey,
    async deliverEnvellope() {
      throw sinkError;
    },
  });

  await assert.rejects(handoff.deliver(payload()), (error) => error === sinkError);
});

test("non-canonical base64url encoding fails closed", async () => {
  const keys = rsaPair();
  let envelope;
  const handoff = createTrustEvaluationCredentialEnvelopeHandoff({
    recipientPublicKey: keys.publicKey,
    async deliverEnvelope(value) {
      envelope = structuredClone(value);
    },
  });
  await handoff.deliver(payload());
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
