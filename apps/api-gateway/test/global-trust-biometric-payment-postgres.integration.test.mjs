import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createHash } from "node:crypto";

import { createBiometricPaymentChallenge } from "@apidevelopers/contracts";
import {
  createPostgresBiometricPaymentChallengeStore,
} from "../src/global-trust-biometric-payment-store.mjs";

const requireFromPersistence = createRequire(
  new URL("../../../packages/persistence-core/package.json", import.meta.url),
);
const { Pool } = requireFromPersistence("pg");

const connectionString = process.env.POSTGRES_TEST_URL;

function createPool() {
  return new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 5_000,
  });
}

function challengeFixture() {
  const raw = Buffer.alloc(32, 19);
  return createBiometricPaymentChallenge({
    challengeId: "challenge.postgres.001",
    paymentIntentId: "payment.intent.postgres.001",
    subjectId: "subject.igor",
    tenantId: "tenant.uni",
    credentialId: "credential.passkey.001",
    ceremony: "webauthn",
    challengeB64u: raw.toString("base64url"),
    challengeDigest: createHash("sha256").update(raw).digest("hex"),
    paymentContextDigest: "b".repeat(64),
    payeeId: "payee.merchant.001",
    amountMinor: 12_990,
    currency: "BRL",
    purposeCode: "checkout.purchase",
    rpId: "pay.apidevelopers.digital",
    expectedOrigin: "https://pay.apidevelopers.digital",
    createdAt: "2026-08-13T22:00:00.000Z",
    expiresAt: "2026-08-13T22:05:00.000Z",
  });
}

test(
  "PostgreSQL challenge store is durable, transactional and replay-safe across concurrent consumers and reconnect",
  { skip: !connectionString },
  async (t) => {
    const namespace = `trustpay_${Date.now()}_${process.pid}`;
    const challenge = challengeFixture();
    const pools = [];

    t.after(async () => {
      await Promise.allSettled(pools.map((pool) => pool.end()));
    });

    const poolA = createPool();
    const poolB = createPool();
    pools.push(poolA, poolB);

    const storeA = createPostgresBiometricPaymentChallengeStore({
      pool: poolA,
      namespace,
    });
    const storeB = createPostgresBiometricPaymentChallengeStore({
      pool: poolB,
      namespace,
    });

    assert.equal(storeA.durability, "durable");
    assert.equal(storeA.backend, "postgres");
    assert.equal(storeB.durability, "durable");

    await storeA.issue(challenge);
    assert.deepEqual(await storeB.get(challenge.challengeId), challenge);

    const attempts = await Promise.allSettled([
      storeA.consume({
        challengeId: challenge.challengeId,
        challengeDigest: challenge.challengeDigest,
        now: "2026-08-13T22:01:00.000Z",
      }),
      storeB.consume({
        challengeId: challenge.challengeId,
        challengeDigest: challenge.challengeDigest,
        now: "2026-08-13T22:01:00.000Z",
      }),
    ]);

    assert.equal(attempts.filter((entry) => entry.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((entry) => entry.status === "rejected").length, 1);
    const rejected = attempts.find((entry) => entry.status === "rejected");
    assert.equal(rejected.reason.code, "TRUST_PAYMENT_REPLAY_BLOCKED");

    await Promise.all([poolA.end(), poolB.end()]);
    pools.length = 0;

    const poolC = createPool();
    pools.push(poolC);
    const recovered = createPostgresBiometricPaymentChallengeStore({
      pool: poolC,
      namespace,
    });

    assert.equal(recovered.durability, "durable");
    assert.deepEqual(await recovered.get(challenge.challengeId), challenge);
    await assert.rejects(
      recovered.consume({
        challengeId: challenge.challengeId,
        challengeDigest: challenge.challengeDigest,
        now: "2026-08-13T22:02:00.000Z",
      }),
      (error) => error.code === "TRUST_PAYMENT_REPLAY_BLOCKED",
    );
  },
);
