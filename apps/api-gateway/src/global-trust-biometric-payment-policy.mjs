import {
  assertBiometricPaymentChallengeContract,
  assertRiskAssessmentContract,
  createAuthorizationDecision,
} from "@apidevelopers/contracts";
import { sha256 } from "./global-trust-biometric-payment-verifier.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function required(value, name) {
  if (value == null || String(value).trim() === "") fail("TRUST_PAYMENT_INVALID_INPUT", `${name} is required`);
  return String(value).trim();
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("TRUST_PAYMENT_INVALID_INPUT", `${name} must be an object`);
  }
  return value;
}

export function createInMemoryBiometricPaymentChallengeStore() {
  const records = new Map();

  return Object.freeze({
    durability: "ephemeral",

    async issue(challenge) {
      assertBiometricPaymentChallengeContract(challenge);
      if (records.has(challenge.challengeId)) {
        fail("TRUST_PAYMENT_CHALLENGE_EXISTS", "challenge already exists");
      }
      records.set(challenge.challengeId, Object.freeze({ challenge, consumedAt: null }));
      return challenge;
    },

    async get(challengeId) {
      return records.get(required(challengeId, "challengeId"))?.challenge ?? null;
    },

    async consume({ challengeId, challengeDigest, now = new Date().toISOString() } = {}) {
      const id = required(challengeId, "challengeId");
      const record = records.get(id);
      if (!record) fail("TRUST_PAYMENT_CHALLENGE_NOT_FOUND", "challenge was not found");
      if (record.consumedAt != null) fail("TRUST_PAYMENT_REPLAY_BLOCKED", "challenge was already consumed");
      if (record.challenge.challengeDigest !== challengeDigest) {
        fail("TRUST_PAYMENT_CHALLENGE_DIGEST_MISMATCH", "challenge digest does not match the stored challenge");
      }
      if (Date.parse(now) > Date.parse(record.challenge.expiresAt)) {
        fail("TRUST_PAYMENT_CHALLENGE_EXPIRED", "challenge has expired");
      }
      records.set(id, Object.freeze({ challenge: record.challenge, consumedAt: now }));
      return Object.freeze({ consumed: true, consumedAt: now });
    },
  });
}

export function createNullBiometricPaymentAdapter() {
  return Object.freeze({
    mode: "dry-run",
    contactEnabled: false,
    async authorize({
      paymentIntentId,
      amountMinor,
      currency,
      idempotencyKey,
    } = {}) {
      return Object.freeze({
        status: "simulated",
        provider: "null",
        providerReference: `dryrun.${sha256(`${paymentIntentId}:${idempotencyKey}`).slice(0, 24)}`,
        paymentIntentId,
        amountMinor,
        currency,
        financialExecutionOccurred: false,
      });
    },
  });
}

export function normalizeRuntimePolicy(policy = {}) {
  const maxAutoAuthorizeMinorByCurrency = Object.freeze({ ...(policy.maxAutoAuthorizeMinorByCurrency ?? {}) });
  const spcRequiredAboveMinorByCurrency = Object.freeze({ ...(policy.spcRequiredAboveMinorByCurrency ?? {}) });
  const challengeTtlMs = Number(policy.challengeTtlMs ?? 120_000);
  if (!Number.isInteger(challengeTtlMs) || challengeTtlMs < 10_000 || challengeTtlMs > 600_000) {
    fail("TRUST_PAYMENT_POLICY_INVALID", "challengeTtlMs must be between 10000 and 600000");
  }
  return Object.freeze({
    version: required(policy.version ?? "trust-payment-policy-v1", "policy.version"),
    challengeTtlMs,
    maxAutoAuthorizeMinorByCurrency,
    spcRequiredAboveMinorByCurrency,
  });
}

export function paymentDecision({ intent, challenge, riskAssessment, policy, idFactory, now }) {
  assertRiskAssessmentContract(riskAssessment, "riskAssessment");
  if (riskAssessment.subjectId !== intent.subjectId || riskAssessment.tenantId !== intent.tenantId) {
    fail("TRUST_PAYMENT_RISK_SCOPE_MISMATCH", "risk assessment subject or tenant does not match payment intent");
  }

  const reasons = [`risk_level:${riskAssessment.level}`];
  let effect = "allow";

  if (riskAssessment.level === "critical") {
    effect = "deny";
    reasons.push("critical_risk");
  } else if (riskAssessment.level === "high") {
    effect = "pending_approval";
    reasons.push("high_risk_requires_review");
  }

  const autoLimit = Number(policy.maxAutoAuthorizeMinorByCurrency[intent.currency]);
  if (!Number.isInteger(autoLimit) || autoLimit < 1) {
    if (effect === "allow") effect = "pending_approval";
    reasons.push("currency_auto_limit_not_configured");
  } else if (intent.amountMinor > autoLimit && effect === "allow") {
    effect = "pending_approval";
    reasons.push("amount_above_auto_authorize_limit");
  }

  const spcThreshold = Number(policy.spcRequiredAboveMinorByCurrency[intent.currency]);
  if (
    Number.isInteger(spcThreshold)
    && spcThreshold > 0
    && intent.amountMinor > spcThreshold
    && challenge.ceremony !== "secure_payment_confirmation"
  ) {
    effect = "deny";
    reasons.push("secure_payment_confirmation_required");
  }

  return createAuthorizationDecision({
    decisionId: idFactory(),
    subjectId: intent.subjectId,
    tenantId: intent.tenantId,
    action: "payment.authorize",
    resource: `payment:${intent.paymentIntentId}`,
    effect,
    policyVersion: policy.version,
    reasonCodes: reasons,
    humanApprovalRequired: effect === "pending_approval",
    decidedAt: now(),
  });
}

export function requireRiskEvaluator(value) {
  const evaluator = assertObject(value, "riskEvaluator");
  if (typeof evaluator.assess !== "function") fail("TRUST_PAYMENT_RISK_EVALUATOR_REQUIRED", "riskEvaluator.assess must be a function");
  return evaluator;
}

export function requireCredentialResolver(value) {
  if (typeof value !== "function") fail("TRUST_PAYMENT_CREDENTIAL_RESOLVER_REQUIRED", "credentialResolver must be a function");
  return value;
}

export function requirePaymentAdapter(adapter) {
  const normalized = assertObject(adapter, "paymentAdapter");
  if (!["dry-run", "external"].includes(normalized.mode)) {
    fail("TRUST_PAYMENT_ADAPTER_INVALID", "paymentAdapter.mode must be dry-run or external");
  }
  if (typeof normalized.authorize !== "function") {
    fail("TRUST_PAYMENT_ADAPTER_INVALID", "paymentAdapter.authorize must be a function");
  }
  return normalized;
}

export function noopSink() {
  return Object.freeze({ async append() { return true; } });
}

