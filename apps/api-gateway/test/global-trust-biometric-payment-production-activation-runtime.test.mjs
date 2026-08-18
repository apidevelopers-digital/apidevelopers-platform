import assert from "node:assert/strict";
import test from "node:test";

import {
  BIOMETRIC_PAYMENT_PRODUCTION_ACTIVATION_GATES,
} from "../src/global-trust-biometric-payment-production-activation.mjs";
import {
  createBiometricPaymentRuntime,
} from "../src/global-trust-biometric-payment-runtime.mjs";

const APPROVED_AT = "2026-08-13T23:50:00.000Z";

function activation(providerId = "provider.alpha") {
  return {
    providerId,
    environment: "production",
    gates: Object.fromEntries(
      BIOMETRIC_PAYMENT_PRODUCTION_ACTIVATION_GATES.map((name) => [
        name,
        { approved: true, evidenceRef: `evidence.${name}.001`, approvedAt: APPROVED_AT },
      ]),
    ),
  };
}

function durableChallengeStore() {
  return Object.freeze({
    durability: "durable",
    async issue() { throw new Error("constructor must not issue a challenge"); },
    async get() { throw new Error("constructor must not read a challenge"); },
    async consume() { throw new Error("constructor must not consume a challenge"); },
  });
}

function externalAdapter(providerId = "provider.alpha") {
  return Object.freeze({
    mode: "external",
    providerId,
    async authorize() {
      throw new Error("constructor must not contact external payment adapter");
    },
  });
}

function baseOptions(providerId = "provider.alpha") {
  return {
    credentialResolver: async () => null,
    riskEvaluator: Object.freeze({
      async assess() { throw new Error("constructor must not assess risk"); },
    }),
    challengeStore: durableChallengeStore(),
    paymentAdapter: externalAdapter(providerId),
    externalExecutionApproved: true,
  };
}

test("raw external runtime rejects boolean approval without production activation evidence", () => {
  assert.throws(
    () => createBiometricPaymentRuntime(baseOptions()),
    (error) => error.code === "TRUST_PAYMENT_PRODUCTION_ACTIVATION_BLOCKED",
  );
});

test("raw external runtime binds activation evidence to provider identity", () => {
  assert.throws(
    () =>
      createBiometricPaymentRuntime({
        ...baseOptions("provider.beta"),
        productionActivation: activation("provider.alpha"),
      }),
    (error) => error.code === "TRUST_PAYMENT_PRODUCTION_ACTIVATION_PROVIDER_MISMATCH",
  );
});

test("complete synthetic activation evidence permits constructor only and performs no external contact", () => {
  const runtime = createBiometricPaymentRuntime({
    ...baseOptions("provider.alpha"),
    productionActivation: activation("provider.alpha"),
  });
  assert.equal(runtime.mode, "external");
});
