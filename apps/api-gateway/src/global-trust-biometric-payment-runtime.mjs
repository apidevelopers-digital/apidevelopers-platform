import {
  createAuditEvent,
  createAuthenticationContext,
  createBiometricPaymentChallenge,
  createBiometricPaymentProof,
  createEvidenceRecord,
  assertBiometricPaymentChallengeContract,
  assertBiometricPaymentCeremony,
  assertBiometricPaymentIntentContract,
  assertRiskAssessmentContract,
} from "@apidevelopers/contracts";
import { randomBytes, randomUUID } from "node:crypto";
import {
  createPaymentContextDigest,
  normalizeBiometricPaymentCredential,
  sha256,
  verifyBiometricPaymentAssertion,
} from "./global-trust-biometric-payment-verifier.mjs";
import {
  createInMemoryBiometricPaymentChallengeStore,
  createNullBiometricPaymentAdapter,
  normalizeRuntimePolicy,
  noopSink,
  paymentDecision,
  requireCredentialResolver,
  requirePaymentAdapter,
  requireRiskEvaluator,
} from "./global-trust-biometric-payment-policy.mjs";
import { assertBiometricPaymentProductionActivation } from "./global-trust-biometric-payment-production-activation.mjs";
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function required(value, name) {
  if (value == null || String(value).trim() === "") fail("TRUST_PAYMENT_INVALID_INPUT", `${name} is required`);
  return String(value).trim();
}
export function createBiometricPaymentRuntime({
  credentialResolver,
  riskEvaluator,
  challengeStore = createInMemoryBiometricPaymentChallengeStore(),
  paymentAdapter = createNullBiometricPaymentAdapter(),
  auditSink = noopSink(),
  evidenceSink = noopSink(),
  credentialStateSink = noopSink(),
  policy: policyInput = {},
  externalExecutionApproved = false,
  productionActivation = null,
  idFactory = randomUUID,
  randomBytesFactory = randomBytes,
  now = () => new Date().toISOString(),
} = {}) {
  const resolveCredential = requireCredentialResolver(credentialResolver);
  const assessRisk = requireRiskEvaluator(riskEvaluator);
  const adapter = requirePaymentAdapter(paymentAdapter);
  const policy = normalizeRuntimePolicy(policyInput);
  if (typeof challengeStore?.issue !== "function" || typeof challengeStore?.get !== "function" || typeof challengeStore?.consume !== "function") {
    fail("TRUST_PAYMENT_CHALLENGE_STORE_INVALID", "challengeStore must implement issue/get/consume");
  }
  if (adapter.mode === "external" && externalExecutionApproved !== true) {
    fail("TRUST_PAYMENT_EXTERNAL_EXECUTION_BLOCKED", "external payment execution requires explicit approval");
  }
  if (adapter.mode === "external" && challengeStore.durability !== "durable") {
    fail("TRUST_PAYMENT_DURABLE_STORE_REQUIRED", "external payment execution requires a durable challenge store");
  }
  if (adapter.mode === "external" && externalExecutionApproved === true) {
    const providerId = String(adapter.providerId ?? adapter.providerName ?? adapter.name ?? "").trim();
    if (!providerId) {
      fail(
        "TRUST_PAYMENT_PRODUCTION_ACTIVATION_PROVIDER_REQUIRED",
        "external payment adapter must expose providerId, providerName or name",
       );
    }
    assertBiometricPaymentProductionActivation(productionActivation ?? {}, { providerId });
  }
  if (typeof idFactory !== "function" || typeof randomBytesFactory !== "function" || typeof now !== "function") {
    fail("TRUST_PAYMENT_RUNTIME_INVALID", "idFactory, randomBytesFactory and now must be functions");
  }
  return Object.freeze({
    mode: adapter.mode,
    policy,
    async issueChallenge({
      intent,
      credentialId,
      ceremony = "webauthn",
      rpId,
      expectedOrigin,
      expectedTopOrigin = null,
      expectedPayeeName = null,
      expectedPayeeOrigin = null,
      expectedAmountValue = null,
    } = {}) {
      assertBiometricPaymentIntentContract(intent);
      if (Date.parse(now()) >= Date.parse(intent.expiresAt)) {
        fail("TRUST_PAYMENT_INTENT_EXPIRED", "payment intent has expired");
      }
      const credential = normalizeBiometricPaymentCredential(await resolveCredential({
        credentialId: required(credentialId, "credentialId"),
        subjectId: intent.subjectId,
        tenantId: intent.tenantId,
      }));
      if (credential.credentialId !== credentialId || credential.subjectId !== intent.subjectId || credential.tenantId !== intent.tenantId) {
        fail("TRUST_PAYMENT_CREDENTIAL_SCOPE_MISMATCH", "resolved credential does not match requested payment scope");
      }
      if (ceremony === "secure_payment_confirmation" && !credential.paymentCredential) {
        fail("TRUST_PAYMENT_SPC_CREDENTIAL_REQUIRED", "SPC requires a payment-enabled credential");
      }
      const issuedAt = now();
      const rawChallenge = randomBytesFactory(32);
      if (!Buffer.isBuffer(rawChallenge) || rawChallenge.length < 32) {
        fail("TRUST_PAYMENT_RANDOMNESS_INVALID", "randomBytesFactory must return at least 32 bytes");
      }
      const challengeB64u = rawChallenge.toString("base64url");
      const requestedExpiry = new Date(Date.parse(issuedAt) + policy.challengeTtlMs).toISOString();
      const expiresAt = Date.parse(requestedExpiry) < Date.parse(intent.expiresAt)
        ? requestedExpiry
        : intent.expiresAt;
      const challenge = createBiometricPaymentChallenge({
        challengeId: idFactory(),
        paymentIntentId: intent.paymentIntentId,
        subjectId: intent.subjectId,
        tenantId: intent.tenantId,
        credentialId: credential.credentialId,
        ceremony,
        challengeB64u,
        challengeDigest: sha256(rawChallenge),
        paymentContextDigest: createPaymentContextDigest(intent),
        payeeId: intent.payeeId,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        purposeCode: intent.purposeCode,
        rpId,
        expectedOrigin,
        expectedTopOrigin,
        expectedPayeeName,
        expectedPayeeOrigin,
        expectedAmountValue,
        createdAt: issuedAt,
        expiresAt,
      });
      await challengeStore.issue(challenge);
      return challenge;
    },
    async authorize({
      intent,
      challengeId,
      assertion,
      localVerificationMethodHint = "unknown",
    } = {}) {
      assertBiometricPaymentIntentContract(intent);
      const challenge = await challengeStore.get(required(challengeId, "challengeId"));
      if (!challenge) fail("TRUST_PAYMENT_CHALLENGE_NOT_FOUND", "challenge was not found");
      assertBiometricPaymentChallengeContract(challenge);
      if (challenge.paymentIntentId !== intent.paymentIntentId) {
        fail("TRUST_PAYMENT_INTENT_MISMATCH", "challenge does not belong to payment intent");
      }
      if (createPaymentContextDigest(intent) !== challenge.paymentContextDigest) {
        fail("TRUST_PAYMENT_CONTEXT_MISMATCH", "payment intent was modified after challenge issuance");
      }
      const credential = normalizeBiometricPaymentCredential(await resolveCredential({
        credentialId: challenge.credentialId,
        subjectId: intent.subjectId,
        tenantId: intent.tenantId,
      }));

      const verification = verifyBiometricPaymentAssertion({
        assertion,
        credential,
        challenge,
      });
      const verifiedAt = now();
      await challengeStore.consume({
        challengeId: challenge.challengeId,
        challengeDigest: challenge.challengeDigest,
        now: verifiedAt,
      });
      const authenticationContext = createAuthenticationContext({
        authenticationId: idFactory(),
        subjectId: intent.subjectId,
        tenantId: intent.tenantId,
        methods: ["passkey", "user_verification"],
        assuranceLevel: credential.assuranceLevel,
        authenticatedAt: verifiedAt,
        expiresAt: new Date(Date.parse(verifiedAt) + 5 * 60_000).toISOString(),
      });
      const proof = createBiometricPaymentProof({
        proofId: idFactory(),
        challengeId: challenge.challengeId,
        paymentIntentId: intent.paymentIntentId,
        authenticationId: authenticationContext.authenticationId,
        subjectId: intent.subjectId,
        tenantId: intent.tenantId,
        credentialId: credential.credentialId,
        assertionDigest: verification.assertionDigest,
        paymentContextDigest: challenge.paymentContextDigest,
        localVerificationMethodHint,
        verifiedAt,
      });
      assertBiometricPaymentCeremony({
        intent,
        challenge,
        proof,
        authenticationContext,
      });
      const riskAssessment = await assessRisk.assess({
        useCase: "payment.biometric.authorize",
        intent,
        challenge,
        proof,
        authenticationContext,
        credential: Object.freeze({
          credentialId: credential.credentialId,
          assuranceLevel: credential.assuranceLevel,
          paymentCredential: credential.paymentCredential,
          backupEligible: credential.backupEligible,
          signCount: credential.signCount,
          newSignCount: verification.newSignCount,
        }),
      });
      assertRiskAssessmentContract(riskAssessment, "riskAssessment");
      const decision = paymentDecision({
        intent,
        challenge,
        riskAssessment,
        policy,
        idFactory,
        now,
      });

      const auditOutcome = decision.effect === "allow"
        ? "success"
        : decision.effect === "deny"
          ? "denied"
          : "pending_approval";

      const auditEvent = createAuditEvent({
        eventId: idFactory(),
        tenantId: intent.tenantId,
        actorId: intent.subjectId,
        action: "payment.authorize",
        resource: `payment:${intent.paymentIntentId}`,
        outcome: auditOutcome,
        correlationId: challenge.challengeId,
        occurredAt: now(),
        metadata: {
          paymentIntentId: intent.paymentIntentId,
          proofId: proof.proofId,
          decisionId: decision.decisionId,
          assessmentId: riskAssessment.assessmentId,
          riskLevel: riskAssessment.level,
          ceremony: challenge.ceremony,
          localVerificationMethodHint,
          methodHintAuthoritative: false,
        },
      });

      const decisionDigest = sha256(Buffer.from(JSON.stringify({
        paymentIntentId: intent.paymentIntentId,
        challengeId: challenge.challengeId,
        proofId: proof.proofId,
        decisionId: decision.decisionId,
        effect: decision.effect,
        reasonCodes: decision.reasonCodes,
        riskAssessmentId: riskAssessment.assessmentId,
        assertionDigest: proof.assertionDigest,
        paymentContextDigest: proof.paymentContextDigest,
      }), "utf8"));

      const evidenceRecord = createEvidenceRecord({
        evidenceId: idFactory(),
        tenantId: intent.tenantId,
        kind: "decision",
        source: "global-trust-biometric-payment-runtime",
        digest: decisionDigest,
        capturedAt: now(),
      });

      await credentialStateSink.append(Object.freeze({
        credentialId: credential.credentialId,
        tenantId: credential.tenantId,
        subjectId: credential.subjectId,
        previousSignCount: credential.signCount,
        newSignCount: verification.newSignCount,
        verifiedAt,
      }));
      await auditSink.append(auditEvent);
      await evidenceSink.append(evidenceRecord);

      let execution = null;
      if (decision.effect === "allow") {
        execution = await adapter.authorize({
          paymentIntentId: intent.paymentIntentId,
          subjectId: intent.subjectId,
          tenantId: intent.tenantId,
          payeeId: intent.payeeId,
          amountMinor: intent.amountMinor,
          currency: intent.currency,
          purposeCode: intent.purposeCode,
          proofId: proof.proofId,
          authorizationDecisionId: decision.decisionId,
          idempotencyKey: intent.paymentIntentId,
        });
        if (!execution || typeof execution !== "object") {
          fail("TRUST_PAYMENT_ADAPTER_INVALID_RESPONSE", "payment adapter returned an invalid response");
        }
        if (adapter.mode === "dry-run" && execution.financialExecutionOccurred !== false) {
          fail("TRUST_PAYMENT_DRY_RUN_VIOLATION", "dry-run adapter must not execute a financial transaction");
        }
      }

      return Object.freeze({
        intent,
        challenge,
        proof,
        authenticationContext,
        riskAssessment,
        authorizationDecision: decision,
        auditEvent,
        evidenceRecord,
        execution,
        financialExecutionOccurred: execution?.financialExecutionOccurred === true,
      });
    },
  });
}
