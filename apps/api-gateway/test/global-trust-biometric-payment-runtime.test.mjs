import assert from "node:assert/strict";
import test from "node:test";
import {
  createHash,
  generateKeyPairSync,
  sign as signBytes,
} from "node:crypto";

import {
  createBiometricPaymentIntent,
  createRiskAssessment,
} from "@apidevelopers/contracts";
import {
  createBiometricPaymentRuntime,
} from "../src/global-trust-biometric-payment-runtime.mjs";

const fixedNow = "2026-08-13T09:01:00.000Z";
const rpId = "pay.apidevelopers.digital";
const expectedOrigin = "https://pay.apidevelopers.digital";
const expectedTopOrigin = "https://apidevelopers.digital";
const payeeName = "API Developers.digital";
const payeeOrigin = "https://apidevelopers.digital";

function idFactory() {
  let n = 0;
  return () => `test.id.${String(++n).padStart(3, "0")}`;
}

function createFixture({ riskScore = 5 } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const credential = {
    credentialId: "credential.passkey.001",
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
  };

  const intent = createBiometricPaymentIntent({
    paymentIntentId: "payment.intent.001",
    subjectId: credential.subjectId,
    tenantId: credential.tenantId,
    payeeId: "payee.merchant.001",
    amountMinor: 12990,
    currency: "BRL",
    purposeCode: "checkout.purchase",
    createdAt: "2026-08-13T09:00:00.000Z",
    expiresAt: "2026-08-13T09:10:00.000Z",
  });

  const riskEvaluator = {
    async assess({ intent: assessedIntent }) {
      return createRiskAssessment({
        assessmentId: "risk.assessment.001",
        subjectId: assessedIntent.subjectId,
        tenantId: assessedIntent.tenantId,
        useCase: "payment.biometric.authorize",
        score: riskScore,
        factors: ["verified_passkey", "transaction_bound"],
        methodVersion: "trust-payment-risk-test-v1",
        assessedAt: fixedNow,
      });
    },
  };

  const runtime = createBiometricPaymentRuntime({
    credentialResolver: async () => credential,
    riskEvaluator,
    policy: {
      version: "trust-payment-policy-test-v1",
      challengeTtlMs: 120000,
      maxAutoAuthorizeMinorByCurrency: { BRL: 50000 },
      spcRequiredAboveMinorByCurrency: { BRL: 10000 },
    },
    idFactory: idFactory(),
    randomBytesFactory: () => Buffer.alloc(32, 7),
    now: () => fixedNow,
  });

  return { runtime, intent, credential, privateKey };
}

function makeAssertion({ challenge, credential, privateKey, amountValue = null } = {}) {
  const clientData = challenge.ceremony === "secure_payment_confirmation"
    ? {
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
            value: amountValue ?? challenge.expectedAmountValue,
          },
        },
      }
    : {
        type: "webauthn.get",
        challenge: challenge.challengeB64u,
        origin: challenge.expectedOrigin,
        crossOrigin: false,
      };

  const clientDataJSON = Buffer.from(JSON.stringify(clientData), "utf8");
  const rpHash = createHash("sha256").update(challenge.rpId, "utf8").digest();
  const authData = Buffer.alloc(37);
  rpHash.copy(authData, 0);
  authData[32] = 0x05; // UP + UV
  authData.writeUInt32BE(1, 33);

  const clientDataHash = createHash("sha256").update(clientDataJSON).digest();
  const signature = signBytes("sha256", Buffer.concat([authData, clientDataHash]), privateKey);

  return {
    credentialId: credential.credentialId,
    clientDataJSONB64u: clientDataJSON.toString("base64url"),
    authenticatorDataB64u: authData.toString("base64url"),
    signatureB64u: signature.toString("base64url"),
  };
}

async function issueSpc(runtime, intent) {
  return runtime.issueChallenge({
    intent,
    credentialId: "credential.passkey.001",
    ceremony: "secure_payment_confirmation",
    rpId,
    expectedOrigin,
    expectedTopOrigin: expectedTopOrigin,
    expectedPayeeName: payeeName,
    expectedPayeeOrigin: payeeOrigin,
    expectedAmountValue: "129.90",
  });
}

test("SPC verifies a real ES256 assertion and authorizes only in dry-run", async () => {
  const { runtime, intent, credential, privateKey } = createFixture();
  const challenge = await issueSpc(runtime, intent);
  const assertion = makeAssertion({ challenge, credential, privateKey });

  const result = await runtime.authorize({
    intent,
    challengeId: challenge.challengeId,
    assertion,
    localVerificationMethodHint: "face",
  });

  assert.equal(result.authorizationDecision.effect, "allow");
  assert.equal(result.proof.userVerified, true);
  assert.equal(result.proof.localVerificationMethodHint, "face");
  assert.equal(result.proof.methodHintAuthoritative, false);
  assert.equal(result.execution.status, "simulated");
  assert.equal(result.financialExecutionOccurred, false);
  assert.equal(result.auditEvent.sensitiveContentIncluded, false);
  assert.equal(result.evidenceRecord.sensitiveContentIncluded, false);
});

test("a consumed payment challenge cannot be replayed", async () => {
  const { runtime, intent, credential, privateKey } = createFixture();
  const challenge = await issueSpc(runtime, intent);
  const assertion = makeAssertion({ challenge, credential, privateKey });

  await runtime.authorize({ intent, challengeId: challenge.challengeId, assertion, localVerificationMethodHint: "palm" });

  await assert.rejects(
    runtime.authorize({ intent, challengeId: challenge.challengeId, assertion, localVerificationMethodHint: "palm" }),
    (error) => error.code === "TRUST_PAYMENT_REPLAY_BLOCKED",
  );
});

test("SPC rejects a cryptographically signed but tampered displayed amount", async () => {
  const { runtime, intent, credential, privateKey } = createFixture();
  const challenge = await issueSpc(runtime, intent);
  const assertion = makeAssertion({ challenge, credential, privateKey, amountValue: "1.00" });

  await assert.rejects(
    runtime.authorize({ intent, challengeId: challenge.challengeId, assertion, localVerificationMethodHint: "iris" }),
    (error) => error.code === "TRUST_PAYMENT_SPC_AMOUNT_MISMATCH",
  );
});

test("policy denies WebAuthn when SPC is required for the transaction amount", async () => {
  const { runtime, intent, credential, privateKey } = createFixture();
  const challenge = await runtime.issueChallenge({
    intent,
    credentialId: credential.credentialId,
    ceremony: "webauthn",
    rpId,
    expectedOrigin,
  });
  const assertion = makeAssertion({ challenge, credential, privateKey });

  const result = await runtime.authorize({ intent, challengeId: challenge.challengeId, assertion });
  assert.equal(result.authorizationDecision.effect, "deny");
  assert.ok(result.authorizationDecision.reasonCodes.includes("secure_payment_confirmation_required"));
  assert.equal(result.execution, null);
  assert.equal(result.financialExecutionOccurred, false);
});

test("high risk becomes pending approval and does not reach the payment adapter", async () => {
  const { runtime, intent, credential, privateKey } = createFixture({ riskScore: 60 });
  const challenge = await issueSpc(runtime, intent);
  const assertion = makeAssertion({ challenge, credential, privateKey });

  const result = await runtime.authorize({ intent, challengeId: challenge.challengeId, assertion });
  assert.equal(result.authorizationDecision.effect, "pending_approval");
  assert.equal(result.authorizationDecision.humanApprovalRequired, true);
  assert.equal(result.execution, null);
});

test("external payment execution is fail-closed without explicit approval and durable replay state", () => {
  const externalAdapter = {
    mode: "external",
    async authorize() {
      throw new Error("must never be reached by constructor validation");
    },
  };

  assert.throws(
    () => createBiometricPaymentRuntime({
      credentialResolver: async () => ({}),
      riskEvaluator: { async assess() { return {}; } },
      paymentAdapter: externalAdapter,
    }),
    (error) => error.code === "TRUST_PAYMENT_EXTERNAL_EXECUTION_BLOCKED",
   );
});
