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

function capture(target) {
  return Object.freeze({
    async append(value) {
      target.push(value);
      return true;
    },
  });
}

function request(id = "reconcile.001") {
  return {
    paymentIntentId: `payment.intent.${id}`,
    subjectId: "subject.igor",
    tenantId: "tenant.uni",
    payeeId: "payee.merchant.001",
    amountMinor: 12_990,
    currency: "BRL",
    purposeCode: "checkout.purchase",
    proofId: `proof.${id}`,
    authorizationDecisionId: `decision.${id}`,
    idempotencyKey: `payment.intent.${id}`,
  };
}

test("reconciliation failures share the authorization circuit and recover through half-open", async () => {
  let clock = 50_000;
  let authorizeCalls = 0;
  let statusCalls = 0;
  const telemetry = [];
  const incidents = [];

  const provider = {
    mode: "sandbox",
    name: "provider-neutral-reconciliation-sandbox",
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
      if (statusCalls <= 2) {
        const error = new Error("provider status endpoint unavailable");
        error.code = "TRUST_PAYMENT_PROVIDER_UPSTREAM_STATUS_UNAVAILABLE";
        error.retryable = true;
        throw error;
      }
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
    controlPolicy: {
      maxAttempts: 1,
      maxAmountMinorByCurrency: { BRL: 50_000 },
    },
    operationalPolicy: {
      failureThreshold: 2,
      cooldownMs: 500,
      autoKillSwitchAfterOpenCount: 3,
    },
    nowMs: () => clock,
    now: () => new Date(clock).toISOString(),
    idFactory: (() => {
      let n = 0;
      return () => `attempt.${++n}`;
    })(),
  });

  const pending = await adapter.authorize(request());
  assert.equal(pending.status, "pending");
  assert.equal(authorizeCalls, 1);

  for (let i = 0; i < 2; i += 1) {
    await assert.rejects(
      adapter.reconcile({ idempotencyKey: "payment.intent.reconcile.001" }),
      (error) => error.code === "TRUST_PAYMENT_PROVIDER_UPSTREAM_STATUS_UNAVAILABLE",
    );
  }

  assert.equal(adapter.operationalStatus().circuit.state, "open");
  assert.equal(adapter.operationalStatus().counters.reconcileTotal, 2);
  assert.equal(adapter.operationalStatus().counters.reconcileFailed, 2);
  assert.equal(statusCalls, 2);

  await assert.rejects(
    adapter.reconcile({ idempotencyKey: "payment.intent.reconcile.001" }),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_CIRCUIT_OPEN",
  );
  assert.equal(statusCalls, 2);
  assert.equal(adapter.operationalStatus().counters.reconcileBlocked, 1);

  clock += 501;
  const reconciled = await adapter.reconcile({
    idempotencyKey: "payment.intent.reconcile.001",
  });

  assert.equal(reconciled.status, "authorized");
  assert.equal(statusCalls, 3);
  assert.equal(adapter.operationalStatus().circuit.state, "closed");
  assert.equal(adapter.operationalStatus().counters.reconcileSucceeded, 1);
  assert.equal(adapter.operationalStatus().counters.halfOpenTransitions, 1);

  assert.equal(
    incidents.some(
      (event) =>
        event.type === "trust.payment.provider.circuit_opened"
        && event.operation === "reconcile",
    ),
    true,
  );
  assert.equal(
    telemetry.some((event) => event.type === "trust.payment.provider.reconcile_blocked"),
    true,
  );
  assert.equal(
    telemetry.some(
      (event) =>
        event.type === "trust.payment.provider.circuit_closed"
        && event.operation === "reconcile",
    ),
    true,
   );
  assert.equal(
    [...telemetry, ...incidents].every(
      (event) => event.sensitiveContentIncluded === false,
    ),
    true,
   );
});

test("sandbox operational composition requires reconciliation capability", () => {
  const provider = {
    mode: "sandbox",
    name: "provider-without-status",
    idempotencyGuaranteed: true,
    financialExecutionCapable: false,
    async authorize() {
      return {
        status: "pending",
        providerReference: "sandbox.pending",
        providerCode: "SANDBOX_PENDING",
      };
    },
  };

  assert.throws(
    () =>
      createOperationalSandboxBiometricPaymentExecutionAdapter({
        store: createMemoryStore(),
        provider,
      }),
    (error) =>
      error.code === "TRUST_PAYMENT_OPERATIONAL_RECONCILIATION_UNAVAILABLE",
  );
});
