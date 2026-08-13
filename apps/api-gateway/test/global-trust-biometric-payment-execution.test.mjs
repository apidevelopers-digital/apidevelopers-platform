import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import {
  createBiometricPaymentExecutionAdapter,
  createSandboxBiometricPaymentProvider,
} from "../src/global-trust-biometric-payment-execution.mjs";

function request(overrides = {}) {
  return {
    paymentIntentId: "payment.intent.001",
    subjectId: "subject.igor",
    tenantId: "tenant.uni",
    payeeId: "payee.merchant.001",
    amountMinor: 12990,
    currency: "BRL",
    purposeCode: "checkout.purchase",
    proofId: "proof.payment.001",
    authorizationDecisionId: "decision.payment.001",
    idempotencyKey: "payment.intent.001",
    ...overrides,
  };
}

async function fixture(t, provider) {
  const root = await mkdtemp(join(tmpdir(), "apidev-trust-payment-execution-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = createJsonFileStore({ filePath: join(root, "state.json") });
  let seq = 0;
  return createBiometricPaymentExecutionAdapter({
    store,
    provider,
    now: () => "2026-08-13T09:01:00.000Z",
    idFactory: () => `attempt.${String(++seq).padStart(3, "0")}`,
  });
}

test("sandbox execution is idempotent and never reports financial execution", async (t) => {
  let calls = 0;
  const base = createSandboxBiometricPaymentProvider({ behavior: "authorized" });
  const provider = {
    ...base,
    async authorize(value) {
      calls += 1;
      return base.authorize(value);
    },
  };
  const adapter = await fixture(t, provider);

  const first = await adapter.authorize(request());
  const second = await adapter.authorize(request());

  assert.equal(first.status, "authorized");
  assert.equal(first.providerContactOccurred, true);
  assert.equal(first.financialExecutionOccurred, false);
  assert.equal(second.status, "authorized");
  assert.equal(second.cached, true);
  assert.equal(second.providerContactOccurred, false);
  assert.equal(second.financialExecutionOccurred, false);
  assert.equal(calls, 1);
});

test("idempotency key cannot be rebound to another amount or transaction", async (t) => {
  const adapter = await fixture(t, createSandboxBiometricPaymentProvider());
  await adapter.authorize(request());

  await assert.rejects(
    adapter.authorize(request({ amountMinor: 1 })),
    (error) => error.code === "TRUST_PAYMENT_IDEMPOTENCY_CONFLICT",
  );
});

test("pending provider state is reconciled without resubmitting authorization", async (t) => {
  let authorizeCalls = 0;
  let statusCalls = 0;
  const provider = {
    mode: "sandbox",
    name: "reconcilable-sandbox",
    idempotencyGuaranteed: true,
    financialExecutionCapable: false,
    async authorize({ idempotencyKey }) {
      authorizeCalls += 1;
      return {
        status: "pending",
        providerReference: `sandbox.${idempotencyKey}`,
        providerCode: "PENDING",
      };
    },
    async getStatus({ idempotencyKey }) {
      statusCalls += 1;
      return {
        status: "authorized",
        providerReference: `sandbox.${idempotencyKey}`,
        providerCode: "APPROVED_AFTER_RECONCILIATION",
      };
    },
  };
  const adapter = await fixture(t, provider);

  const first = await adapter.authorize(request());
  assert.equal(first.status, "pending");

  const duplicate = await adapter.authorize(request());
  assert.equal(duplicate.status, "pending");
  assert.equal(duplicate.cached, true);
  assert.equal(authorizeCalls, 1);

  const reconciled = await adapter.reconcile({ idempotencyKey: "payment.intent.001" });
  assert.equal(reconciled.status, "authorized");
  assert.equal(statusCalls, 1);
});

test("provider failure becomes indeterminate and remains recoverable by reconciliation", async (t) => {
  const provider = {
    mode: "sandbox",
    name: "indeterminate-sandbox",
    idempotencyGuaranteed: true,
    financialExecutionCapable: false,
    async authorize() {
      throw new Error("simulated transport break");
    },
    async getStatus({ idempotencyKey }) {
      return {
        status: "authorized",
        providerReference: `sandbox.${idempotencyKey}`,
        providerCode: "RECOVERED",
      };
    },
  };
  const adapter = await fixture(t, provider);

  await assert.rejects(
    adapter.authorize(request()),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_INDETERMINATE",
  );

  const stored = await adapter.get("payment.intent.001");
  assert.equal(stored.status, "indeterminate");

  const reconciled = await adapter.reconcile({ idempotencyKey: "payment.intent.001" });
  assert.equal(reconciled.status, "authorized");
});

test("external provider stays fail-closed without explicit approval and durable state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "apidev-trust-payment-external-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const store = createJsonFileStore({ filePath: join(root, "state.json") });
  const external = {
    mode: "external",
    name: "external-test",
    idempotencyGuaranteed: true,
    financialExecutionCapable: true,
    async authorize() {
      throw new Error("must never be reached");
    },
    async getStatus() {
      throw new Error("must never be reached");
    },
  };

  assert.throws(
    () => createBiometricPaymentExecutionAdapter({ store, provider: external }),
    (error) => error.code === "TRUST_PAYMENT_EXTERNAL_EXECUTION_BLOCKED",
  );

  assert.throws(
    () => createBiometricPaymentExecutionAdapter({
      store,
      provider: external,
      externalExecutionApproved: true,
    }),
    (error) => error.code === "TRUST_PAYMENT_EXECUTION_DURABLE_STORE_REQUIRED",
  );
});
