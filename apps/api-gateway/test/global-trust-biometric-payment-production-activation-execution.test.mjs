import assert from "node:assert/strict";
import test from "node:test";

import {
  BIOMETRIC_PAYMENT_PRODUCTION_ACTIVATION_GATES,
} from "../src/global-trust-biometric-payment-production-activation.mjs";
import {
  createBiometricPaymentExecutionAdapter,
} from "../src/global-trust-biometric-payment-execution.mjs";

const APPROVED_AT = "2026-08-13T23:45:00.000Z";

function durableStore() {
  const state = { collections: {} };
  return Object.freeze({
    kind: "postgres",
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

function externalProvider(providerId = "provider.alpha") {
  return Object.freeze({
    mode: "external",
    providerId,
    name: providerId,
    idempotencyGuaranteed: true,
    async authorize() {
      throw new Error("external provider must not be contacted during constructor validation");
    },
    async getStatus() {
      throw new Error("external provider must not be contacted during constructor validation");
    },
  });
}

function activation(providerId = "provider.alpha") {
  return {
    providerId,
    environment: "production",
    gates: Object.fromEntries(
      BIOMETRIC_PAYMENT_PRODUCTION_ACTIVATION_GATES.map((name) => [
        name,
        {
          approved: true,
          evidenceRef: `evidence.${name}.001`,
          approvedAt: APPROVED_AT,
        },
      ]),
    ),
  };
}

test("external execution adapter rejects boolean approval without production evidence", () => {
  assert.throws(
    () =>
      createBiometricPaymentExecutionAdapter({
        store: durableStore(),
        provider: externalProvider(),
        externalExecutionApproved: true,
        durability: "durable",
      }),
    (error) => error.code === "TRUST_PAYMENT_PRODUCTION_ACTIVATION_BLOCKED",
  );
});

test("external execution adapter binds activation evidence to the exact provider", () => {
  assert.throws(
    () =>
      createBiometricPaymentExecutionAdapter({
        store: durableStore(),
        provider: externalProvider("provider.beta"),
        externalExecutionApproved: true,
        durability: "durable",
        productionActivation: activation("provider.alpha"),
      }),
    (error) => error.code === "TRUST_PAYMENT_PRODUCTION_ACTIVATION_PROVIDER_MISMATCH",
  );
});

test("complete synthetic activation evidence only permits construction and does not contact provider", () => {
  const adapter = createBiometricPaymentExecutionAdapter({
    store: durableStore(),
    provider: externalProvider("provider.alpha"),
    externalExecutionApproved: true,
    durability: "durable",
    productionActivation: activation("provider.alpha"),
  });

  assert.equal(adapter.mode, "external");
  assert.equal(adapter.providerId, "provider.alpha");
  assert.equal(adapter.contactEnabled, true);
});
