import assert from "node:assert/strict";
import test from "node:test";

import { createAuthenticationContext } from "../src/global-trust-identity.mjs";
import {
  assertBiometricPaymentCeremony,
  assertBiometricPaymentChallengeContract,
  assertBiometricPaymentProofContract,
  createBiometricPaymentChallenge,
  createBiometricPaymentIntent,
  createBiometricPaymentProof,
} from "../src/global-trust-biometric-payment.mjs";

const tenantId = "tenant.uni";
const subjectId = "subject.igor";
const paymentIntentId = "payment.intent.001";
const credentialId = "credential.passkey.001";
const challengeDigest = "a".repeat(64);
const paymentContextDigest = "b".repeat(64);
const assertionDigest = "c".repeat(64);
const createdAt = "2026-08-13T09:00:00.000Z";
const challengeAt = "2026-08-13T09:00:10.000Z";
const authenticatedAt = "2026-08-13T09:00:20.000Z";
const verifiedAt = "2026-08-13T09:00:21.000Z";
const challengeExpiresAt = "2026-08-13T09:02:00.000Z";
const intentExpiresAt = "2026-08-13T09:05:00.000Z";
const authExpiresAt = "2026-08-13T09:03:00.000Z";

function ceremony(methodHint = "face", assuranceLevel = "aal2") {
  const intent = createBiometricPaymentIntent({
    paymentIntentId,
    subjectId,
    tenantId,
    payeeId: "payee.merchant.001",
    amountMinor: 12990,
    currency: "BRL",
    purposeCode: "checkout.purchase",
    createdAt,
    expiresAt: intentExpiresAt,
  });

  const challenge = createBiometricPaymentChallenge({
    challengeId: "challenge.payment.001",
    paymentIntentId,
    subjectId,
    tenantId,
    credentialId,
    ceremony: "secure_payment_confirmation",
    challengeDigest,
    paymentContextDigest,
    payeeId: intent.payeeId,
    amountMinor: intent.amountMinor,
    currency: intent.currency,
    purposeCode: intent.purposeCode,
    createdAt: challengeAt,
    expiresAt: challengeExpiresAt,
  });

  const proof = createBiometricPaymentProof({
    proofId: "proof.payment.001",
    challengeId: challenge.challengeId,
    paymentIntentId,
    authenticationId: "auth.payment.001",
    subjectId,
    tenantId,
    credentialId,
    assertionDigest,
    paymentContextDigest,
    localVerificationMethodHint: methodHint,
    verifiedAt,
  });

  const authenticationContext = createAuthenticationContext({
    authenticationId: proof.authenticationId,
    subjectId,
    tenantId,
    methods: ["passkey", "user_verification"],
    assuranceLevel,
    authenticatedAt,
    expiresAt: authExpiresAt,
  });

  return { intent, challenge, proof, authenticationContext };
}

test("Face, iris and palm are supported as non-authoritative local verification hints", () => {
  for (const methodHint of ["face", "iris", "palm"]) {
    const value = ceremony(methodHint);
    assert.equal(assertBiometricPaymentCeremony(value), true);
    assert.equal(value.proof.localVerificationMethodHint, methodHint);
    assert.equal(value.proof.methodHintAuthoritative, false);
  }
});

test("payment authorization is fail-closed for biometric material and secret material", () => {
  const { challenge, proof } = ceremony();

  assert.throws(
    () => assertBiometricPaymentChallengeContract({ ...challenge, rawBiometricDataIncluded: true }),
    /rawBiometricDataIncluded must be false/,
  );
  assert.throws(
    () => assertBiometricPaymentChallengeContract({ ...challenge, biometricTemplateIncluded: true }),
    /biometricTemplateIncluded must be false/,
  );
  assert.throws(
    () => assertBiometricPaymentProofContract({ ...proof, secretMaterialIncluded: true }),
    /secretMaterialIncluded must be false/,
  );
});

test("payment authorization requires passkey-backed AAL2 or AAL3", () => {
  const value = ceremony("iris", "aal1");
  assert.throws(
    () => assertBiometricPaymentCeremony(value),
    /requires aal2 or aal3/,
  );

  const strong = ceremony("palm", "aal2");
  const withoutPasskey = {
    ...strong,
    authenticationContext: createAuthenticationContext({
      authenticationId: strong.proof.authenticationId,
      subjectId,
      tenantId,
      methods: ["mfa"],
      assuranceLevel: "aal2",
      authenticatedAt,
      expiresAt: authExpiresAt,
    }),
  };
  assert.throws(
    () => assertBiometricPaymentCeremony(withoutPasskey),
    /methods must include passkey/,
  );
});

test("payment context and challenge validity are bound across the ceremony", () => {
  const value = ceremony();
  assert.throws(
    () => assertBiometricPaymentCeremony({
      ...value,
      challenge: { ...value.challenge, paymentContext: { ...value.challenge.paymentContext, amountMinor: 1 } },
    }),
    /amountMinor must match/,
  );

  assert.throws(
    () => assertBiometricPaymentCeremony({
      ...value,
      proof: { ...value.proof, paymentContextDigest: "d".repeat(64) },
    }),
    /paymentContextDigest must match/,
  );

  assert.throws(
    () => assertBiometricPaymentCeremony({
      ...value,
      proof: { ...value.proof, verifiedAt: "2026-08-13T09:04:00.000Z" },
    }),
    /must be within challenge validity/,
  );
});
