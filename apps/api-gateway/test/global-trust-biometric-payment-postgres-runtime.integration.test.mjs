import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";

import { createBiometricPaymentIntent, createRiskAssessment } from "@apidevelopers/contracts";
import { createPostgresBiometricPaymentChallengeStore } from "../src/global-trust-biometric-payment-store.mjs";
import { createBiometricPaymentRuntime } from "../src/global-trust-biometric-payment-runtime.mjs";

const requirePersistence = createRequire(
  new URL("../../../packages/persistence-core/package.json", import.meta.url),
);
const connectionString = process.env.POSTGRES_TEST_URL;
const NOW = "2026-08-13T23:20:00.000Z";

function createPool() {
  const { Pool } = requirePersistence("pg");
  return new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5_000 });
}

function ids() {
  let n = 0;
  return () => `runtime.${++n}`;
}

function createIntent() {
  return createBiometricPaymentIntent({
    paymentIntentId: "payment.intent.postgres.runtime.001",
    subjectId: "subject.igor",
    tenantId: "tenant.uni",
    payeeId: "payee.merchant.001",
    amountMinor: 12_990,
    currency: "BRL",
    purposeCode: "checkout.purchase",
    createdAt: "2026-08-13T23:19:00.000Z",
    expiresAt: "2026-08-13T23:30:00.000Z",
  });
}

function createAssertion(challenge, credentialId, privateKey) {
  const clientData = Buffer.from(JSON.stringify({
    type: "payment.get",
    challenge: challenge.challengeB64u,
    origin: challenge.expectedOrigin,
    crossOrigin: false,
    payment: {
      rpId: challenge.rpId,
      topOrigin: challenge.expectedTopOrigin,
      payeeName: challenge.expectedPayeeName,
      payeeOrigin: challenge.expectedPayeeOrigin,
      total: {
        currency: challenge.paymentContext.currency,
        value: challenge.expectedAmountValue,
      },
    },
  }));

  const authData = Buffer.alloc(37);
  createHash("sha256").update(challenge.rpId).digest().copy(authData, 0);
  authData[32] = 0x05;
  authData.writeUInt32BE(1, 33);
  const signature = sign(
    "sha256",
    Buffer.concat([authData, createHash("sha256").update(clientData).digest()]),
    privateKey,
  );

  return {
    credentialId,
    clientDataJSONB64u: clientData.toString("base64url"),
    authenticatorDataB64u: authData.toString("base64url"),
    signatureB64u: signature.toString("base64url"),
  };
}

test("runtime SPC consumes durable Postgres replay state", { skip: !connectionString }, async (t) => {
  const poolA = createPool();
  const poolB = createPool();
  t.after(async () => Promise.allSettled([poolA.end(), poolB.end()]));

  const namespace = `trust_runtime_${Date.now()}_${process.pid}`;
  const challengeStore = createPostgresBiometricPaymentChallengeStore({ pool: poolA, namespace });
  const observer = createPostgresBiometricPaymentChallengeStore({ pool: poolB, namespace });
  assert.equal(challengeStore.durability, "durable");
  assert.equal(challengeStore.backend, "postgres");

  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const credentialId = "credential.postgres.runtime.001";
  const stateWrites = [];

  const runtime = createBiometricPaymentRuntime({
    credentialResolver: async () => ({
      credentialId,
      subjectId: "subject.igor",
      tenantId: "tenant.uni",
      status: "active",
      credentialType: "passkey",
      assuranceLevel: "aal2",
      algorithm: -7,
      publicKeyJwk: publicKey.export({ format: "jwk" }),
      signCount: 0,
      paymentCredential: true,
      backupEligible: true,
    }),
    credentialStateSink: {
      async append(value) {
        stateWrites.push(value);
        return true;
      },
    },
    challengeStore,
    paymentAdapter: {
      mode: "dry-run",
      contactEnabled: false,
      async authorize({ paymentIntentId }) {
        return {
          status: "authorized",
          provider: "null-postgres-runtime",
          providerReference: `dryrun.${paymentIntentId}`,
          financialExecutionOccurred: false,
        };
      },
    },
    riskEvaluator: {
      async assess({ intent }) {
        return createRiskAssessment({
          assessmentId: `risk.${intent.paymentIntentId}`,
          subjectId: intent.subjectId,
          tenantId: intent.tenantId,
          useCase: "payment.biometric.authorize",
          score: 5,
          factors: ["verified_passkey", "transaction_bound", "postgres_replay_state"],
          methodVersion: "trust-postgres-runtime-e2e-v1",
          assessedAt: NOW,
        });
      },
    },
    policy: {
      version: "trust-postgres-runtime-e2e-policy-v1",
      challengeTtlMs: 120_000,
      maxAutoAuthorizeMinorByCurrency: { BRL: 50_000 },
      spcRequiredAboveMinorByCurrency: { BRL: 10_000 },
    },
    idFactory: ids(),
    randomBytesFactory: () => Buffer.alloc(32, 31),
    now: () => NOW,
  });

  const intent = createIntent();
  const challenge = await runtime.issueChallenge({
    intent,
    credentialId,
    ceremony: "secure_payment_confirmation",
    rpId: "pay.apidevelopers.digital",
    expectedOrigin: "https://pay.apidevelopers.digital",
    expectedTopOrigin: "https://apidevelopers.digital",
    expectedPayeeName: "API Developers.digital",
    expectedPayeeOrigin: "https://apidevelopers.digital",
    expectedAmountValue: "129.90",
  });

  assert.deepEqual(await observer.get(challenge.challengeId), challenge);

  const result = await runtime.authorize({
    intent,
    challengeId: challenge.challengeId,
    assertion: createAssertion(challenge, credentialId, privateKey),
    localVerificationMethodHint: "face",
  });

  assert.equal(result.authorizationDecision.effect, "allow");
  assert.equal(result.proof.localVerificationMethodHint, "face");
  assert.equal(result.proof.methodHintAuthoritative, false);
  assert.equal(result.execution.status, "authorized");
  assert.equal(result.financialExecutionOccurred, false);
  assert.equal(stateWrites.at(-1).newSignCount, 1);

  await assert.rejects(
    observer.consume({
      challengeId: challenge.challengeId,
      challengeDigest: challenge.challengeDigest,
      now: NOW,
    }),
    (error) => error.code === "TRUST_PAYMENT_REPLAY_BLOCKED",
  );
});
