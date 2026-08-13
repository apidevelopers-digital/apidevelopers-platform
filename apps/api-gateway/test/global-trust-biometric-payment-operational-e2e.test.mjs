import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createBiometricPaymentIntent, createRiskAssessment } from "@apidevelopers/contracts";
import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createPersistentBiometricPaymentChallengeStore } from "../src/global-trust-biometric-payment-store.mjs";
import { createPersistentBiometricPaymentCredentialState } from "../src/global-trust-biometric-payment-credential-state.mjs";
import { createCredentialBoundBiometricPaymentRuntime } from "../src/global-trust-biometric-payment-bound-runtime.mjs";
import { createOperationalSandboxBiometricPaymentExecutionAdapter } from "../src/global-trust-biometric-payment-operational-execution.mjs";

const NOW = "2026-08-13T22:10:00.000Z";
const NOW_MS = Date.parse(NOW);
const sink = (a) => Object.freeze({ async append(v) { a.push(v); return true; } });
const seq = (p) => { let n = 0; return () => `${p}.${++n}`; };

function intent(id) {
  return createBiometricPaymentIntent({
    paymentIntentId: `payment.intent.op.${id}`,
    subjectId: "subject.igor",
    tenantId: "tenant.uni",
    payeeId: "payee.merchant.001",
    amountMinor: 12990,
    currency: "BRL",
    purposeCode: "checkout.purchase",
    createdAt: "2026-08-13T22:09:00.000Z",
    expiresAt: "2026-08-13T22:20:00.000Z",
  });
}

function assertion(challenge, credentialId, privateKey, signCount) {
  const client = Buffer.from(JSON.stringify({
    type: "payment.get",
    challenge: challenge.challengeB64u,
    origin: challenge.expectedOrigin,
    crossOrigin: false,
    payment: {
      rpId: challenge.rpId,
      topOrigin: challenge.expectedTopOrigin,
      payeeName: challenge.expectedPayeeName,
      payeeOrigin: challenge.expectedPayeeOrigin,
      total: { currency: challenge.paymentContext.currency, value: challenge.expectedAmountValue },
    },
  }));
  const auth = Buffer.alloc(37);
  createHash("sha256").update(challenge.rpId).digest().copy(auth, 0);
  auth[32] = 0x05;
  auth.writeUInt32BE(signCount, 33);
  const signature = sign("sha256", Buffer.concat([auth, createHash("sha256").update(client).digest()]), privateKey);
  return {
    credentialId,
    clientDataJSONB64u: client.toString("base64url"),
    authenticatorDataB64u: auth.toString("base64url"),
    signatureB64u: signature.toString("base64url"),
  };
}

test("SPC face iris palm traverse operational Trust sandbox E2E", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "trust-op-e2e-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const credentials = createPersistentBiometricPaymentCredentialState({
    store: createJsonFileStore({ filePath: join(root, "credentials.json") }),
    now: () => NOW,
  });
  const challenges = createPersistentBiometricPaymentChallengeStore({
    store: createJsonFileStore({ filePath: join(root, "challenges.json") }),
  });
  const telemetry = [], incidents = [], audit = [], evidence = [];
  let authorizeCalls = 0, statusCalls = 0;

  const provider = {
    mode: "sandbox",
    name: "provider-neutral-op-e2e",
    idempotencyGuaranteed: true,
    financialExecutionCapable: false,
    async health() { return { status: "healthy" }; },
    async readiness() { return { ready: true }; },
    async authorize({ idempotencyKey }) {
      authorizeCalls += 1;
      const pending = idempotencyKey.endsWith(".003");
      return {
        status: pending ? "pending" : "authorized",
        providerReference: `sandbox.${idempotencyKey}`,
        providerCode: pending ? "PENDING" : "APPROVED",
        financialExecutionOccurred: false,
      };
    },
    async getStatus({ idempotencyKey }) {
      statusCalls += 1;
      return {
        status: "authorized",
        providerReference: `sandbox.${idempotencyKey}`,
        providerCode: "RECONCILED",
        financialExecutionOccurred: false,
      };
    },
  };

  const paymentAdapter = createOperationalSandboxBiometricPaymentExecutionAdapter({
    store: createJsonFileStore({ filePath: join(root, "executions.json") }),
    provider,
    telemetrySink: sink(telemetry),
    incidentSink: sink(incidents),
    controlPolicy: { maxAttempts: 1, maxAmountMinorByCurrency: { BRL: 50000 }, maxTransactionsPerTenantWindow: 20 },
    operationalPolicy: { failureThreshold: 2, cooldownMs: 500, autoKillSwitchAfterOpenCount: 3 },
    nowMs: () => NOW_MS,
    now: () => NOW,
    idFactory: seq("attempt"),
  });

  assert.equal(paymentAdapter.mode, "dry-run");
  assert.equal(paymentAdapter.providerMode, "sandbox");
  assert.equal(paymentAdapter.contactEnabled, false);
  assert.equal((await paymentAdapter.health()).status, "healthy");
  assert.equal((await paymentAdapter.readiness()).ready, true);

  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const credentialId = "credential.op.001";
  await credentials.register({
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

  const runtime = createCredentialBoundBiometricPaymentRuntime({
    credentialState: credentials,
    challengeStore: challenges,
    paymentAdapter,
    riskEvaluator: {
      async assess({ intent: i }) {
        return createRiskAssessment({
          assessmentId: `risk.${i.paymentIntentId}`,
          subjectId: i.subjectId,
          tenantId: i.tenantId,
          useCase: "payment.biometric.authorize",
          score: 5,
          factors: ["verified_passkey", "transaction_bound", "operational_path"],
          methodVersion: "trust-op-e2e-v1",
          assessedAt: NOW,
        });
      },
    },
    auditSink: sink(audit),
    evidenceSink: sink(evidence),
    policy: {
      version: "trust-op-e2e-policy-v1",
      challengeTtlMs: 120000,
      maxAutoAuthorizeMinorByCurrency: { BRL: 50000 },
      spcRequiredAboveMinorByCurrency: { BRL: 10000 },
    },
    idFactory: seq("op"),
    randomBytesFactory: () => Buffer.alloc(32, 17),
    now: () => NOW,
  });

  for (const [id, hint, count, expected] of [
    ["001", "face", 1, "authorized"],
    ["002", "iris", 2, "authorized"],
    ["003", "palm", 3, "pending"],
  ]) {
    const i = intent(id);
    const challenge = await runtime.issueChallenge({
      intent: i,
      credentialId,
      ceremony: "secure_payment_confirmation",
      rpId: "pay.apidevelopers.digital",
      expectedOrigin: "https://pay.apidevelopers.digital",
      expectedTopOrigin: "https://apidevelopers.digital",
      expectedPayeeName: "API Developers.digital",
      expectedPayeeOrigin: "https://apidevelopers.digital",
      expectedAmountValue: "129.90",
    });
    const result = await runtime.authorize({
      intent: i,
      challengeId: challenge.challengeId,
      assertion: assertion(challenge, credentialId, privateKey, count),
      localVerificationMethodHint: hint,
    });
    assert.equal(result.authorizationDecision.effect, "allow");
    assert.equal(result.proof.localVerificationMethodHint, hint);
    assert.equal(result.proof.methodHintAuthoritative, false);
    assert.equal(result.execution.status, expected);
    assert.equal(result.financialExecutionOccurred, false);
  }

  assert.equal((await paymentAdapter.reconcile({ idempotencyKey: "payment.intent.op.003" })).status, "authorized");
  assert.equal(authorizeCalls, 3);
  assert.equal(statusCalls, 1);
  assert.equal((await credentials.resolve({ credentialId, subjectId: "subject.igor", tenantId: "tenant.uni" })).signCount, 3);

  const status = paymentAdapter.operationalStatus();
  assert.equal(status.circuit.state, "closed");
  assert.equal(status.counters.authorizeSucceeded, 3);
  assert.equal(status.counters.reconcileSucceeded, 1);
  assert.equal(status.control.killSwitch, false);
  assert.equal(audit.length, 3);
  assert.equal(evidence.length, 3);

  const emitted = [...telemetry, ...incidents, ...audit, ...evidence];
  assert.equal(emitted.every((e) => e.sensitiveContentIncluded === false), true);
  const serialized = JSON.stringify(emitted).toLowerCase();
  for (const forbidden of ["privatekey", "biometrictemplate", "faceimage", "irisscan", "palmimage", "cardnumber", "cvv"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
