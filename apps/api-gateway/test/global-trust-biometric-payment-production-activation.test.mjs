import assert from "node:assert/strict";
import test from "node:test";

import {
  BIOMETRIC_PAYMENT_PRODUCTION_ACTIVATION_GATES,
  assertBiometricPaymentProductionActivation,
  evaluateBiometricPaymentProductionActivation,
} from "../src/global-trust-biometric-payment-production-activation.mjs";

const APPROVED_AT = "2026-08-13T23:30:00.000Z";

function completeEvidence(providerId = "provider.test") {
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

test("production activation is blocked when required evidence is absent", () => {
  const report = evaluateBiometricPaymentProductionActivation({
    providerId: "provider.test",
    environment: "production",
    gates: {},
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.blockers.length, BIOMETRIC_PAYMENT_PRODUCTION_ACTIVATION_GATES.length);
  assert.ok(report.blockers.includes("realMoneyApproved:missing"));
});

test("approved booleans without evidence references do not activate production", () => {
  const evidence = completeEvidence();
  evidence.gates.realMoneyApproved = {
    approved: true,
    evidenceRef: null,
    approvedAt: APPROVED_AT,
  };

  const report = evaluateBiometricPaymentProductionActivation(evidence);
  assert.equal(report.status, "blocked");
  assert.ok(report.blockers.includes("realMoneyApproved:evidence_missing"));
});

test("complete evidence approves only the matching provider", () => {
  const evidence = completeEvidence("provider.alpha");
  const report = assertBiometricPaymentProductionActivation(evidence, {
    providerId: "provider.alpha",
  });

  assert.equal(report.status, "approved");
  assert.equal(report.providerId, "provider.alpha");
  assert.equal(report.rawBiometricDataIncluded, false);
  assert.equal(report.paymentSecretsIncluded, false);

  assert.throws(
    () => assertBiometricPaymentProductionActivation(evidence, { providerId: "provider.beta" }),
    (error) => error.code === "TRUST_PAYMENT_PRODUCTION_ACTIVATION_PROVIDER_MISMATCH",
  );
});

test("activation evidence rejects secret or biometric material", () => {
  const evidence = completeEvidence();
  evidence.gates.securityReviewApproved.secret = "must-never-enter-evidence";

  const report = evaluateBiometricPaymentProductionActivation(evidence);
  assert.equal(report.status, "invalid");
  assert.deepEqual(report.blockers, ["TRUST_PAYMENT_PRODUCTION_ACTIVATION_SENSITIVE_MATERIAL"]);
});
