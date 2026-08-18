import assert from "node:assert/strict";
import test from "node:test";

import {
  createBiometricPaymentProviderControl,
} from "../src/global-trust-biometric-payment-provider-control.mjs";

function request(overrides = {}) {
  return {
    paymentIntentId: "payment.intent.001",
    tenantId: "tenant.uni",
    subjectId: "subject.igor",
    payeeId: "payee.merchant.001",
    amountMinor: 12_990,
    currency: "BRL",
    idempotencyKey: "payment.intent.001",
    ...overrides,
  };
}

function sandboxProvider(overrides = {}) {
  let authorizeCalls = 0;

  const provider = {
    mode: "sandbox",
    name: "provider-neutral-sandbox",
    idempotencyGuaranteed: true,
    safeRetryAfterTransportFailure: true,

    async health() {
      return { status: "healthy" };
    },

    async readiness() {
      return { ready: true };
    },

    async authorize({ idempotencyKey }) {
      authorizeCalls += 1;
      return {
        status: "authorized",
        providerReference: `sandbox.${idempotencyKey}`,
        providerCode: "SANDBOX_APPROVED",
      };
    },

    ...overrides,
  };

  return {
    provider,
    calls: () => authorizeCalls,
  };
}

test("provider control is deny-by-default", async () => {
  const { provider } = sandboxProvider();
  const control = createBiometricPaymentProviderControl({ provider });

  assert.equal((await control.readiness()).ready, false);
  assert.equal(control.status().enabledByPolicy, false);

  await assert.rejects(
    control.authorize(request()),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_DISABLED",
  );
});

test("sandbox provider exposes health/readiness and authorizes under explicit limits", async () => {
  const { provider, calls } = sandboxProvider();
  const control = createBiometricPaymentProviderControl({
    provider,
    policy: {
      enabled: true,
      allowModes: ["sandbox"],
      maxAmountMinorByCurrency: { BRL: 20_000 },
      maxTransactionsPerTenantWindow: 2,
      windowMs: 60_000,
    },
  });

  const health = await control.health();
  const readiness = await control.readiness();
  const result = await control.authorize(request());

  assert.equal(health.status, "healthy");
  assert.equal(readiness.ready, true);
  assert.equal(result.status, "authorized");
  assert.equal(result.control.mode, "sandbox");
  assert.equal(result.control.attempt, 1);
  assert.equal(calls(), 1);
});

test("external provider mode is blocked by sandbox-only policy", async () => {
  const { provider } = sandboxProvider({ mode: "external", name: "external-test" });
  const control = createBiometricPaymentProviderControl({
    provider,
    policy: {
      enabled: true,
      allowModes: ["sandbox"],
    },
  });

  await assert.rejects(
    control.authorize(request()),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_MODE_BLOCKED",
  );
});

test("kill switch immediately blocks authorization and readiness", async () => {
  const { provider } = sandboxProvider();
  const control = createBiometricPaymentProviderControl({
    provider,
    policy: { enabled: true },
  });

  control.engageKillSwitch("incident.payment-provider");

  assert.equal(control.status().killSwitch, true);
  assert.equal((await control.readiness()).ready, false);

  await assert.rejects(
    control.authorize(request()),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_KILL_SWITCH",
  );

  control.resetKillSwitch();
  assert.equal(control.status().killSwitch, false);
});

test("amount and per-tenant transaction limits fail closed", async () => {
  const { provider } = sandboxProvider();
  const control = createBiometricPaymentProviderControl({
    provider,
    policy: {
      enabled: true,
      maxAmountMinorByCurrency: { BRL: 13_000 },
      maxTransactionsPerTenantWindow: 1,
      windowMs: 60_000,
    },
    nowMs: () => 1_000,
  });

  await assert.rejects(
    control.authorize(request({ amountMinor: 13_001 })),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_AMOUNT_LIMIT",
  );

  const first = await control.authorize(request());
  assert.equal(first.status, "authorized");

  await assert.rejects(
    control.authorize(request({ idempotencyKey: "payment.intent.002" })),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_TENANT_RATE_LIMIT",
  );
});

test("retry occurs only when provider explicitly marks transport retry as safe", async () => {
  let calls = 0;
  const provider = {
    mode: "sandbox",
    name: "safe-retry-sandbox",
    idempotencyGuaranteed: true,
    safeRetryAfterTransportFailure: true,
    async authorize() {
      calls += 1;
      if (calls === 1) {
        const error = new Error("temporary transport failure");
        error.retryable = true;
        throw error;
      }
      return {
        status: "authorized",
        providerReference: "sandbox.retry.001",
        providerCode: "SANDBOX_APPROVED",
      };
    },
  };

  const control = createBiometricPaymentProviderControl({
    provider,
    policy: {
      enabled: true,
      maxAttempts: 2,
      timeoutMs: 1_000,
    },
    sleep: async () => {},
  });

  const result = await control.authorize(request());
  assert.equal(result.status, "authorized");
  assert.equal(result.control.attempt, 2);
  assert.equal(calls, 2);
});

test("retryable error is not retried without provider safety declaration", async () => {
  let calls = 0;
  const provider = {
    mode: "sandbox",
    name: "unsafe-retry-sandbox",
    idempotencyGuaranteed: true,
    safeRetryAfterTransportFailure: false,
    async authorize() {
      calls += 1;
      const error = new Error("transport failure");
      error.retryable = true;
      throw error;
    },
  };

  const control = createBiometricPaymentProviderControl({
    provider,
    policy: {
      enabled: true,
      maxAttempts: 3,
    },
    sleep: async () => {},
  });

  await assert.rejects(control.authorize(request()), /transport failure/);
  assert.equal(calls, 1);
});
