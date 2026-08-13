import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:osimport { createHash } from "node:crypto";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createBiometricPaymentChallenge } from "@apidevelopers/contracts";
import { createPersistentBiometricPaymentChallengeStore } from "../src/global-trust-biometric-payment-store.mjs";

function challengeFixture() {
  const raw = Buffer.alloc(32, 7);
  return createBiometricPaymentChallenge({
    challengeId: "challenge.persistent.001",
    paymentIntentId: "payment.intent.001",
    subjectId: "subject.igor",
    tenantId: "tenant.uni",
    credentialId: "credential.passkey.001",
    ceremony: "webauthn",
    challengeB64u: raw.toString("base64url"),
    challengeDigest: createHash("sha256").update(raw).digest("hex"),
    paymentContextDigest: "b".repeat(64),
    payeeId: "payee.merchant.001",
    amountMinor: 12990,
    currency: "BRL",
    purposeCode: "checkout.purchase",
    rpId: "pay.apidevelopers.digital",
    expectedOrigin: "https://pay.apidevelopers.digital",
    createdAt: "2026-08-13T09:00:00.000Z",
    expiresAt: "2026-08-13T09:02:00.000Z",
  });
}

test("persistent challenge store survives reopen and blocks concurrent replay", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "apidev-trust-payment-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const filePath = join(root, "state.json");
  const challenge = challengeFixture();

  const first = createPersistentBiometricPaymentChallengeStore({
    store: createJsonFileStore({ filePath }),
  });
  assert.equal(first.durability, "development");
  await first.issue(challenge);

  const second = createPersistentBiometricPaymentChallengeStore({
    store: createJsonFileStore({ filePath }),
  });
  const restored = await second.get(challenge.challengeId);
  assert.deepEqual(restored, challenge);

  const results = await Promise.allSettled([
    second.consume({
      challengeId: challenge.challengeId,
      challengeDigest: challenge.challengeDigest,
      now: "2026-08-13T09:01:00.000Z",
    }),
    second.consume({
      challengeId: challenge.challengeId,
      challengeDigest: challenge.challengeDigest,
      now: "2026-08-13T09:01:00.000Z",
    }),
  ]);

  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected").length, 1);
  const rejected = results.find((item) => item.status === "rejected");
  assert.equal(rejected.reason.code, "TRUST_PAYMENT_REPLAY_BLOCKED");
});
