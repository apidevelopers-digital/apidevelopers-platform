import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, generateKeyPairSync, sign as signBytes } from "node:crypto";

import {
  createBiometricPaymentIntent,
  createRiskAssessment,
} from "@apidevelopers/contracts";
import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createPersistentBiometricPaymentChallengeStore } from "../src/global-trust-biometric-payment-store.mjs";
import { createPersistentBiometricPaymentCredentialState } from "../src/global-trust-biometric-payment-credential-state.mjs";
import {
  createBiometricPaymentExecutionAdapter,
  createSandboxBiometricPaymentProvider,
} from "../src/global-trust-biometric-payment-execution.mjs";
import { createCredentialBoundBiometricPaymentRuntime } from "../src/global-trust-biometric-payment-bound-runtime.mjs";

const NOW = "2026-08-13T17:40:00.000Z";
const RP_ID = "pay.apidevelopers.digital";
const ORIGIN = "https://pay.apidevelopers.digital";
const TOP_ORIGIN = "https://apidevelopers.digital";
const PAYEE_NAME = "API Developers.digital";
const PAYEE_ORIGIN = "https://apidevelopers.digital";

function ids(prefix) {
  let n = 0;
  return () => `${prefix}.${String(++n).padStart(4, "0")}`;
}

function intent(id) {
  return createBiometricPaymentIntent({
    paymentIntentId: id,
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

function assertion({ challenge, credentialId, privateKey, signCount }) {
  const clientDataJSON = Buffer.from(JSON.stringify({
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
  }), "utf8");

  const rpHash = createHash("sha256").update(challenge.rpId, "utf8").digest();
  const authenticatorData = Buffer.alloc(37);
  rpHash.copy(authenticatorData, 0);
  authenticatorData[32] = 0x05;
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
    async assess({ intent: paymentIntent }) {
      return createRiskAssessment({
        assessmentId: `risk.${paymentIntent.paymentIntentId}`,
        subjectId: paymentIntent.subjectId,
        tenantId: paymentIntent.tenantId,
        useCase: "payment.biometric.authorize",
        score: 5,
        factors: ["verified_passkey", "transaction_bound", "persistent_sign_count"],
        methodVersion: "trust-payment-e2e-v1",
        assessedAt: NOW,
      });
    },
  };
}

async function makeRuntime({
  credentialPath,
  challengePath,
  executionPath,
  auditEvents,
  evidenceRecords,
  prefix,
}) {
  const credentialState = createPersistentBiometricPaymentCredentialState({
    store: createJsonFileStore({ filePath: credentialPath }),
    now: () => NOW,
  });
  const challengeStore = createPersistentBiometricPaymentChallengeStore({
    store: createJsonFileStore({ filePath: challengePath }),
  });
  const executionAdapter = createBiometricPaymentExecutionAdapter({
    store: createJsonFileStore({ filePath: executionPath }),
    provider: createSandboxBiometricPaymentProvider({ behavior: "authorized" }),
    now: () => NOW,
    idFactory: ids(`${prefix}.attempt`),
  });
  const sink = (target) => Object.freeze({
    async append(value) {
      target.push(value);
      return true;
    },
  });

  return {
    credentialState,
    runtime: createCredentialBoundBiometricPaymentRuntime({
      credentialState,
      challengeStore,
      paymentAdapter: executionAdapter,
      riskEvaluator: riskEvaluator(),
      auditSink: sink(auditEvents),
      evidenceSink: sink(evidenceRecords),
      policy: {
        version: "trust-payment-e2e-policy-v1",
        challengeTtlMs: 120000,
        maxAutoAuthorizeMinorByCurrency: { BRL: 50000 },
        spcRequiredAboveMinorByCurrency: { BRL: 10000 },
      },
      idFactory: ids(prefix),
      randomBytesFactory: () => Buffer.alloc(32, prefix === "first" ? 9 : 10),
      now: () => NOW,
    }),
  };
}

async function spcChallenge(runtime, paymentIntent, credentialId) {
  return runtime.issueChallenge({
    intent: paymentIntent,
    credentialId,
    ceremony: "secure_payment_confirmation",
    rpId: RP_ID,
    expectedOrigin: ORIGIN,
    expectedTopOrigin: TOP_ORIGIN,
    expectedPayeeName: PAYEE_NAME,
    expectedPayeeOrigin: PAYEE_ORIGIN,
    expectedAmountValue: "129.90",
  });
}

test("E2E persistent signCount survives runtime recreation and SPC reaches idempotent sandbox", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "apidev-trust-payment-e2e-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const credentialPath = join(root, "credentials.json");
  const challengePath = join(root, "challenges.json");
  const executionPath = join(root, "executions.json");
  const auditEvents = [];
  const evidenceRecords = [];

  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const credentialId = "credential.passkey.001";

  const first = await makeRuntime({
    credentialPath, challengePath, executionPath, auditEvents, evidenceRecords, prefix: "first",
  });

  await first.credentialState.register({
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
  });

  const intent1 = intent("payment.intent.001");
  const challenge1 = await spcChallenge(first.runtime, intent1, credentialId);
  const result1 = await first.runtime.authorize({
    intent: intent1,
    challengeId: challenge1.challengeId,
    assertion: assertion({ challenge: challenge1, credentialId, privateKey, signCount: 1 }),
    localVerificationMethodHint: "face",
  });

  assert.equal(result1.authorizationDecision.effect, "allow");
  assert.equal(result1.execution.status, "authorized");
  assert.equal(result1.execution.financialExecutionOccurred, false);
  assert.equal(result1.proof.localVerificationMethodHint, "face");
  assert.equal(result1.proof.methodHintAuthoritative, false);

  const stored1 = await first.credentialState.resolve({
    credentialId, subjectId: "subject.igor", tenantId: "tenant.uni",
  });
  assert.equal(stored1.signCount, 1);

  const second = await makeRuntime({
    credentialPath, challengePath, executionPath, auditEvents, evidenceRecords, prefix: "second",
  });
  const restored = await second.credentialState.resolve({
    credentialId, subjectId: "subject.igor", tenantId: "tenant.uni",
  });
  assert.equal(restored.signCount, 1);

  const intent2 = intent("payment.intent.002");
  const challenge2 = await spcChallenge(second.runtime, intent2, credentialId);
  const result2 = await second.runtime.authorize({
    intent: intent2,
    challengeId: challenge2.challengeId,
    assertion: assertion({ challenge: challenge2, credentialId, privateKey, signCount: 2 }),
    localVerificationMethodHint: "iris",
  });

  assert.equal(result2.authorizationDecision.effect, "allow");
  assert.equal(result2.execution.status, "authorized");
  assert.equal(result2.execution.financialExecutionOccurred, false);
  assert.equal(result2.proof.localVerificationMethodHint, "iris");

  const stored2 = await second.credentialState.resolve({
    credentialId, subjectId: "subject.igor", tenantId: "tenant.uni",
  });
  assert.equal(stored2.signCount, 2);
  assert.equal(auditEvents.length, 2);
  assert.equal(evidenceRecords.length, 2);
  assert.equal(auditEvents.every((event) => event.sensitiveContentIncluded === false), true);
  assert.equal(evidenceRecords.every((record) => record.sensitiveContentIncluded === false), true);

  await assert.rejects(
    second.runtime.authorize({
      intent: intent2,
      challengeId: challenge2.challengeId,
      assertion: assertion({ challenge: challenge2, credentialId, privateKey, signCount: 2 }),
      localVerificationMethodHint: "palm",
    }),
    (error) => new Set([
      "TRUST_PAYMENT_SIGN_COUNT_REPLAY",
      "TRUST_PAYMENT_REPLAY_BLOCKED",
    ]).has(error.code),
  );
});

test("external execution requires durable credential signCount state", async (t) => {
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
