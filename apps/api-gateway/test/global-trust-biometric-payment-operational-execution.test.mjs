import assert from "node:assert/strict";
import test from "node:test";

import { createOperationalSandboxBiometricPaymentExecutionAdapter } from "../src/global-trust-biometric-payment-operational-execution.mjs";

function createMemoryStore() {
  const state = { collections: {} };
  return Object.freeze({
    kind: "memory",
    async read() {
      return structuredClone(state);
    },
    async transaction(operation) {
      const tx = {
        get(collection, key) {
          return state.collections?.[collection]?.[key] ?? null;
        },
        put(collection, key, value) {
          state.collections[collection] ??= {};
          state.collections[collection][key] = structuredClone(value);
        },
      };
      return { result: await operation(tx) };
    },
  });
}

function request(id) {
  return {
    paymentIntentId: `payment.intent.${id}`,
    subjectId: "subject.igor",
    tenantId: "tenant.uni",
    payeeId: "payee.merchant.001",
    amountMinor: 12990,
    currency: "BRL",
    purposeCode: "checkout.purchase",
    proofId: `proof.${id}`,
    authorizationDecisionId: `decision.${id}`,
    idempotencyKey: `payment.intent.${id}`,
  };
}

function capture(target) {
  return Object.freeze({
    async append(value) {
      target.push(value);
      return true;
    },
  });
}

test("operational sandbox execution routes provider calls through circuit breaker", async () => {
  let calls = 0;
  let clock = 10_000;
  const telemetry = [];
  const incidents = [];

  const provider = {
    mode: "sandbox",
    name: "provider-neutral-wired-sandbox",
    idempotencyGuaranteed: true,
    financialExecutionCapable: false,
    async authorize({ idempotencyKey }) {
      calls += 1;
      if (calls <= 2) {
        const error = new Error("upstream unavailable");
        error.code = "TRUST_PAYMENT_PROVIDER_UPSTREAM_UNAVAILABLE";
        error.retryable = true;
        throw error;
      }
      return {
        status: "authorized",
        providerReference: `sandbox.${idempotencyKey}`,
        providerCode: "SANDBOX_APPROVED",
      };
    },
    async getStatus({ idempotencyKey }) {
      return {
        status: "authorized",
        providerReference: `sandbox.${idempotencyKey}`,
        providerCode: "SANDBOX_RECONCILED",
      };
    },
  };

  const adapter = createOperationalSandboxBiometricPaymentExecutionAdapter({
    store: createMemoryStore(),
    provider,
    telemetrySink: capture(telemetry),
    incidentSink: capture(incidents),
    controlPolicy: { maxAttempts: 1, maxAmountMinorByCurrency: { BRL: 50000 } },
    operationalPolicy: { failureThreshold: 2, cooldownMs: 500, autoKillSwitchAfterOpenCount: 3 },
    nowMs: () => clock,
    now: () => new Date(clock).toISOString(),
    idFactory: (() => { let n = 0; return () => `attempt.${++n}`; })(),
  });

  assert.equal(adapter.mode, "dry-run");
  assert.equal(adapter.providerMode, "sandbox");
  assert.equal(adapter.contactEnabled, false);

  await assert.rejects(
    adapter.authorize(request("001")),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_INDETERMINATE",
  );
  await assert.rejects(
    adapter.authorize(request("002")),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_INDETERMINATE",
  );

  assert.equal(adapter.operationalStatus().circuit.state, "open");
  assert.equal(calls(), 2);

  await assert.rejects(
    adapter.authorize(request("003")),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_INDETERMINATE",
   );
  assert.equal(calls(), 2);

  clock += 501;
  const recovered = await adapter.authorize(request("004"));
  assert.equal(recovered.status, "authorized");
  assert.equal(recovered.financialExecutionOccurred, false);
  assert.equal(calls, 3);
  assert.equal(adapter.operationalStatus().circuit.state, "closed");

  assert.equal(incidents.some((event) => event.type === "trust.payment.provider.circuit_opened"), true);
  assert.equal(telemetry.some((event) => event.type === "trust.payment.provider.authorize_blocked"), true);
  assert.equal(telemetry.some((event) => event.type === "trust.payment.provider.circuit_half_open"), true);
  assert.equal(telemetry.some((event) => event.type === "trust.payment.provider.circuit_closed"), true);
});

test("operational sandbox execution remains idempotent and reconciliation-capable", async () => {
  let authorizeCalls = 0;
  let statusCalls = 0;
  const provider = {
    mode: "sandbox",
    name: "provider-neutral-idempotent-sandbox",
    idempotencyGuaranteed: true,
    financialExecutionCapable: false,
    async authorize({ idempotencyKey }) {
      authorizeCalls += 1;
      return {
        status: "pending",
        providerReference: `sandbox.${idempotencyKey}`,
        providerCode: "SANDBOX_PENDING",
      };
    },
    async getStatus({ idempotencyKey }) {
      statusCalls += 1;
      return {
        status: "authorized",
        providerReference: `sandbox.${idempotencyKey}`,
        providerCode: "SANDBOX_RECONCILED",
      };
    },
  };

  const adapter = createOperationalSandboxBiometricPaymentExecutionAdapter({
    store: createMemoryStore(),
    provider,
    controlPolicy: { maxAmountMinorByCurrency: { BRL: 50000 } },
    nowMs: () => 20_000,
    now: () => "2026-08-13T20:20:00.000Z",
    idFactory: () => "attempt.001",
  });

  const first = await adapter.authorize(request("010"));
  const duplicate = await adapter.authorize(request("010"));
  assert.equal(first.status, "pending");
  assert.equal(duplicate.status, "pending");
  assert.equal(duplicate.cached, true);
  assert.equal(authorizeCalls, 1);

  const reconciled = await adapter.reconcile({ idempotencyKey: "payment.intent.010" });
  assert.equal(reconciled.status, "authorized");
  assert.equal(statusCalls, 1);
});

test("operational sandbox composition rejects external and real-money-capable providers", () => {
  const store = createMemoryStore();
  const base = {
    name: "blocked-provider",
    idempotencyGuaranteed: true,
    async authorize() {
      return { status: "authorized", providerReference: "never", providerCode: "NEVER" };
    },
  };

  assert.throws(
    () => createOperationalSandboxBiometricPaymentExecutionAdapter({
      store,
      provider: { ...base, mode: "external", financialExecutionCapable: false },
    }),
    (error) => error.code === "TRUST_PAYMENT_OPERATIONAL_SANDBOX_REQUIRED",
  );

  assert.throws(
    () => createOperationalSandboxBiometricPaymentExecutionAdapter({
      store,
      provider: { ...base, mode: "sandbox", financialExecutionCapable: true },
    }),
    (error) => error.code === "TRUST_PAYMENT_OPERATIONAL_REAL_MONEY_BLOCKED",
  );
});
