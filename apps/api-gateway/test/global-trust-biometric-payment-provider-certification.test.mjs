import assert from "node:assert/strict";
import test from "node:test";

import {
  certifyBiometricPaymentSandboxProvider,
} from "../src/global-trust-biometric-payment-provider-certification.mjs";

function request(overrides = {}) {
  return {
    paymentIntentId: "payment.intent.cert.001",
    tenantId: "tenant.uni",
    subjectId: "subject.igor",
    payeeId: "payee.merchant.001",
    amountMinor: 12990,
    currency: "BRL",
    purposeCode: "checkout.purchase",
    proofId: "proof.cert.001",
    authorizationDecisionId: "decision.cert.001",
    idempotencyKey: "payment.intent.cert.001",
    ...overrides,
  };
}

function certifiedSandboxProvider() {
  const outcomes = new Map();
  let calls = 0;

  return {
    provider: {
      mode: "sandbox",
      name: "provider-neutral-certification-sandbox",
      idempotencyGuaranteed: true,
      safeRetryAfterTransportFailure: true,
      financialExecutionCapable: false,

      async health() {
        return { status: "healthy" };
      },

      async readiness() {
        return { ready: true };
      },

      async authorize({ idempotencyKey }) {
        calls += 1;
        if (outcomes.has(idempotencyKey)) return outcomes.get(idempotencyKey);
        const outcome = Object.freeze({
          status: "authorized",
          providerReference: `sandbox.${idempotencyKey}`,
          providerCode: "SANDBOX_APPROVED",
          financialExecutionOccurred: false,
        });
        outcomes.set(idempotencyKey, outcome);
        return outcome;
      },
    },
    calls: () => calls,
  };
}

test("provider-neutral sandbox passes certification without real-money capability", async () => {
  const { provider, calls } = certifiedSandboxProvider();

  const report = await certifyBiometricPaymentSandboxProvider({
    provider,
    request: request(),
    policy: {
      maxAmountMinorByCurrency: { BRL: 20_000 },
      maxTransactionsPerTenantWindow: 20,
    },
  });

  assert.equal(report.status, "certified");
  assert.equal(report.provider.mode, "sandbox");
  assert.equal(report.provider.financialExecutionCapable, false);
  assert.equal(report.scope.sandboxOnly, true);
  assert.equal(report.scope.realMoneyExecution, false);
  assert.equal(report.scope.rawBiometricDataIncluded, false);
  assert.equal(report.scope.secretsIncluded, false);

  const ids = new Set(report.checks.map((check) => check.id));
  for (const id of [
    "health",
    "readiness",
    "idempotency",
    "kill_switch",
    "deny_by_default",
    "external_mode_blocked",
    "amount_limit",
  ]) {
    assert.equal(ids.has(id), true);
  }
  assert.equal(report.checks.every((check) => check.passed === true), true);

  // Exactly two provider contacts: original + same idempotency key.
  // Negative controls are blocked before provider contact.
  assert.equal(calls(), 2);
});

test("certification rejects providers capable of real financial execution", async () => {
  const { provider } = certifiedSandboxProvider();

  await assert.rejects(
    certifyBiometricPaymentSandboxProvider({
      provider: {
        ...provider,
        financialExecutionCapable: true,
      },
      request: request(),
      policy: {
        maxAmountMinorByCurrency: { BRL: 20_000 },
      },
    }),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_CERTIFICATION_REAL_MONEY_BLOCKED",
  );
});

test("certification rejects external provider mode before any provider contact", async () => {
  const { provider, calls } = certifiedSandboxProvider();

  await assert.rejects(
    certifyBiometricPaymentSandboxProvider({
      provider: {
        ...provider,
        mode: "external",
      },
      request: request(),
      policy: {
        maxAmountMinorByCurrency: { BRL: 20_000 },
      },
    }),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_CERTIFICATION_SANDBOX_REQUIRED",
  );

  assert.equal(calls(), 0);
});

test("certification fails when an explicit per-currency amount limit is missing", async () => {
  const { provider } = certifiedSandboxProvider();

  await assert.rejects(
    certifyBiometricPaymentSandboxProvider({
      provider,
      request: request(),
    }),
    (error) => {
      assert.equal(error.code, "TRUST_PAYMENT_PROVIDER_CERTIFICATION_FAILED");
      assert.equal(error.report.status, "failed");
      const amount = error.report.checks.find((check) => check.id === "amount_limit");
      assert.equal(amount.passed, false);
      assert.equal(amount.observed, "limit_not_configured");
      return true;
    },
  );
});
