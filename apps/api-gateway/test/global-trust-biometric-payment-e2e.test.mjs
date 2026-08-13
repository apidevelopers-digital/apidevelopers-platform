import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createHash,
  generateKeyPairSync,
  sign as signBytes,
} from "node:crypto";

import {
  createBiometricPaymentIntent,
  createRiskAssessment,
} from "@apidevelopers/contracts";
import { createJsonFileStore } from "@apidevelopers/persistence-core";
import {
  createPersistentBiometricPaymentChallengeStore,
} from "../src/global-trust-biometric-payment-store.mjs";
import {
  createPersistentBiometricPaymentCredentialState,
} from "../src/global-trust-biometric-payment-credential-state.mjs";
import {
  createBiometricPaymentExecutionAdapter,
  createSandboxBiometricPaymentProvider,
} from "../src/global-trust-biometric-payment-execution.mjs";
import {
  createCredentialBoundBiometricPaymentRuntime,
} from "../src/global-trust-biometric-payment-bound-runtime.mjs";

const rpId = "pay.apidevelopers.digital";
const expectedOrigin = "https://pay.apidevelopers.digital";
const expectedTopOrigin = "https://apidevelopers.digital";
const payeeName = "API Developers.digital";
const payeeOrigin = "https://apidevelopers.digital";
const fixedNow = "2026-08-13T17:40:00.000Z";

function idFactory(prefix = "id") {
  let n = 0;
  return () => `${prefix}.${String(++n).padStart(4, "0")}`;
}

function makeIntent(paymentIntentId) {
  return createBiometricPaymentIntent({
    paymentIntentId,
    subjectId: "subject.igor",
    tenantId: "tenant.uni",
    payeeId: "payee.merchant.001",
    amountMinor: 12990,
    currency: "BRL",
    purposeCode: "checkout.purchase",
    createdAt: "2026-08-13T17:39:00.000Z",
    expiresAt: "2026-08-13T17:50:00.000Z",
  });
}

function makeAssertion({ challenge, credentialId, privateKey, signCount }) {
  const clientData = {
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
  };

  const clientDataJSON = Buffer.from(JSON.stringify(clientData), "utf8");
  const rpHash = createHash("sha256").update(challenge.rpId, "utf8").digest();
  const authenticatorData = Buffer.alloc(37);
  rpHash.copy(authenticatorData, 0);
  authenticatorData[32] = 0x05; // user present + user verified
  authenticatorData.writeUInt32BE(signCount, 33);

  const clientDataHash = createHash("sha256").update(clientDataJSON).digest();
  const signature = signBytes(
    "sha256",
    Buffer.concat([authenticatorData, clientDataHash]),
    privateKey,
  );

  return {
    credentialId,
    clientDataJSONB64u: clientDataJSON.toString("base64url"),
    authenticatorDataB64u: authenticatorData.toString("base64url"),
    signatureB64u: signature.toString("base64url"),
  };
}

function riskEvaluator() {
  return {
    async assess({ intent }) {
      return createRiskAssessment({
        assessmentId: `risk.${intent.paymentIntentId}`,
        subjectId: intent.subjectId,
        tenantId: intent.tenantId,
        useCase: "payment.biometric.authorize",
        score: 5,
        factors: ["verified_passkey", "transaction_bound", "persistent_sign_count"],
        methodVersion: "trust-payment-e2e-v1",
        assessedAt: fixedNow,
      });
    },
  };
}

function captureSink(target) {
  return Object.freeze({
    async append(value) {
      target.push(value);
      return true;
    },
  });
}

async function createRuntime({
  credentialPath,
  challengePath,
  executionPath,
  auditEvents,
  evidenceRecords,
  idPrefix,
}) {
  const credentialState = createPersistentBiometricPaymentCredentialState({
    store: createJsonFileStore({ filePath: credentialPath }),
    now: () => fixedNow,
  });
  const challengeStore = createPersistentBiometricPaymentChallengeStore({
    store: createJsonFileStore({ filePath: challengePath }),
  });
  const executionAdapter = createBiometricPaymentExecutionAdapter({
    store: createJsonFileStore({ filePath: executionPath }),
    provider: createSandboxBiometricPaymentProvider({ behavior: "authorized" }),
    now: () => fixedNow,
    idFactory: idFactory(`${idPrefix}.attempt`),
  });

  return {
    credentialState,
    runtime: createCredentialBoundBiometricPaymentRuntime({
      credentialState,
      challengeStore,
      paymentAdapter: executionAdapter,
      riskEvaluator: riskEvaluator(),
      auditSink: captureSink(auditEvents),
      evidenceSink: captureSink(evidenceRecords),
      policy: {
        version: "trust-payment-e2e-policy-v1",
        challengeTtlMs: 120000,
        maxAutoAuthorizeMinorByCurrency: { BRL: 50000 },
        spcRequiredAboveMinorByCurrency: { BRL: 10000 },
      },
      idFactory: idFactory(idPrefix),
      randomBytesFactory: () => Buffer.alloc(32, 9),
      now: () => fixedNow,
    }),
  };
}

test("E2E: persistent credential signCount survives runtime recreation and SPC reaches idempotent sandbox authorization", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "apidev-trust-payment-e2e-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const credentialPath = join(root, "credentials.json");
  const challengePath = join(root, "challenges.json");
  const executionPath = join(root, "executions.json");
  const auditEvents = [];
  const evidenceRecords = [];

  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const publicKeyJwk = publicKey.export({ format: "jwk" });
  const credentialId = "credential.passkey.001";

  const first = await createRuntime({
    credentialPath,
    challengePath,
    executionPath,
    auditEvents,
    evidenceRecords,
    idPrefix: "first",
  });

  await first.credentialState.register({
    credentialId,
    subjectId: "subject.igor",
    tenantId: "tenant.uni",
    status: "active",
    credentialType: "passkey",
    assuranceLevel: "aal2",
    algorithm: -7,
    publicKeyJwk,
    signCount: 0,
    paymentCredential: true,
    backupEligible: true,
  });

  const intent1 = makeIntent("payment.intent.001");
  const challenge1 = await first.runtime.issueChallenge({
    intent: intent1,
    credentialId,
    ceremony: "secure_payment_confirmation",
    rpId,
    expectedOrigin,
    expectedTopOrigin,
    expectedPayeeName: payeeName,
    expectedPayeeOrigin: payeeOrigin,
    expectedAmountValue: "129.90",
  });

  const result1 = await first.runtime.authorize({
    intent: intent1,
    challengeId: challenge1.challengeId,
    assertion: makeAssertion({
      challenge: challenge1,
      credentialId,
      privateKey,
      signCount: 1,
    }),
    localVerificationMethodHint: "face",
  });

  assert.equal(result1.authorizationDecision.effect, "allow");
  assert.equal(result1.execution.status, "authorized");
  assert.equal(result1.execution.financialExecutionOccurred, false);
  assert.equal(result1.proof.userVerified, true);
  assert.equal(result1.proof.localVerificationMethodHint, "face");
  assert.equal(result1.proof.methodHintAuthoritative, false);

  const afterFirst = await first.credentialState.resolve({
    credentialId,
    subjectId: "subject.igor",
    tenantId: "tenant.uni",
  });
  assert.equal(afterFirst.signCount, 1);

  // Recreate all runtime-facing stores to prove the next verification reads persisted state.
  const second = await createRuntime({
    credentialPath,
    challengePath,
    executionPath,
    auditEvents,
    evidenceRecords,
    idPrefix: "second",
  });

  const restored = await second.credentialState.resolve({
    credentialId,
    subjectId: "subject.igor",
    tenantId: "tenant.uni",
  });
  assert.equal(restored.signCount, 1);

  const intent2 = makeIntent("payment.intent.002");
  const challenge2 = await second.runtime.issueChallenge({
    intent: intent2,
    credentialId,
    ceremony: "secure_payment_confirmation",
    rpId,
    expectedOrigin,
    expectedTopOrigin,
    expectedPayeeName: payeeName,
    expectedPayeeOrigin: payeeOrigin,
    expectedAmountValue: "129.90",
  });

  const result2 = await second.runtime.authorize({
    intent: intent2,
    challengeId: challenge2.challengeId,
    assertion: makeAssertion({
      challenge: challenge2,
      credentialId,
      privateKey,
      signCount: 2,
    }),
    localVerificationMethodHint: "iris",
  });

  assert.equal(result2.authorizationDecision.effect, "allow");
  assert.equal(result2.execution.status, "authorized");
  assert.equal(result2.execution.financialExecutionOccurred, false);
  assert.equal(result2.proof.localVerificationMethodHint, "iris");

  const afterSecond = await second.credentialState.resolve({
    credentialId,
    subjectId: "subject.igor",
    tenantId: "tenant.uni",
  });
  assert.equal(afterSecond.signCount, 2);

  assert.equal(auditEvents.length, 2);
  assert.equal(evidenceRecords.length, 2);
  assert.equal(auditEvents.every((event) => event.sensitiveContentIncluded === false), true);
  assert.equal(evidenceRecords.every((record) => record.sensitiveContentIncluded === false), true);

  await assert.rejects(
    second.runtime.authorize({
      intent: intent2,
      challengeId: challenge2.challengeId,
      assertion: makeAssertion({
        challenge: challenge2,
        credentialId,
        privateKey,
        signCount: 2,
      }),
      localVerificationMethodHint: "palm",
    }),
    (error) => error.code === "TRUST_PAYMENT_REPLAY_BLOCKED",
  );
});

test("credential-bound runtime rejects external execution when signCount state is not durable", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "apidev-trust-payment-boundary-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const credentialState = createPersistentBiometricPaymentCredentialState({
    store: createJsonFileStore({ filePath: join(root, "credentials.json") }),
  });

  const externalAdapter = {
    mode: "external",
    async authorize() {
      throw new Error("must not be reached");
    },
  };

  assert.throws(
    () => createCredentialBoundBiometricPaymentRuntime({
      credentialState,
      paymentAdapter: externalAdapter,
      externalExecutionApproved: true,
      riskEvaluator: riskEvaluator(),
    }),
    (error) => error.code === "TRUST_PAYMENT_CREDENTIAL_DURABLE_STATE_REQUIRED",
  );
});
