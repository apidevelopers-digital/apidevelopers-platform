import assert from "node:assert/strict";
import test from "node:test";

import { createCredentialBoundBiometricPaymentRuntime } from "../src/global-trust-biometric-payment-bound-runtime.mjs";
import { BIOMETRIC_PAYMENT_PRODUCTION_ACTIVATION_GATES } from "../src/global-trust-biometric-payment-production-activation.mjs";

const APPROVED_AT = "2026-08-13T23:40:00.000Z";

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

function credentialState() {
  return Object.freeze({
    durability: "durable",
    async resolve() { return null; },
    async append() { return true; },
  });
}

function externalAdapter(providerId = "provider.alpha") {
  return Object.freeze({
    mode: "external",
    providerId,
    providerName: providerId,
    async authorize() {
      throw new Error("must not be contacted during constructor validation");
    },
  });
}

test("external credential-bound runtime rejects boolean approval without production evidence", () => {
  assert.throws(
    () => createCredentialBoundBiometricPaymentRuntime({
      credentialState: credentialState(),
      paymentAdapter: externalAdapter(),
      externalExecutionApproved: true,
    }),
    (error) => error.code === "TRUST_PAYMENT_PRODUCTION_ACTIVATION_BLOCKED",
  );
});

test("complete activation evidence does not bypass durable challenge state requirement", () => {
  assert.throws(
    () => createCredentialBoundBiometricPaymentRuntime({
      credentialState: credentialState(),
      paymentAdapter: externalAdapter(),
      externalExecutionApproved: true,
      productionActivation: activation(),
      credentialResolver: async () => null,
      riskEvaluator: { async assess() { return {}; } },
    }),
    (error) => error.code === "TRUST_PAYMENT_DURABLE_STORE_REQUIRED",
  );
});

test("activation evidence is bound to the exact provider", () => {
  assert.throws(
    () => createCredentialBoundBiometricPaymentRuntime({
      credentialState: credentialState(),
      paymentAdapter: externalAdapter("provider.beta"),
      externalExecutionApproved: true,
      productionActivation: activation("provider.alpha"),
    }),
    (error) => error.code === "TRUST_PAYMENT_PRODUCTION_ACTIVATION_PROVIDER_MISMATCH",
  );
});
