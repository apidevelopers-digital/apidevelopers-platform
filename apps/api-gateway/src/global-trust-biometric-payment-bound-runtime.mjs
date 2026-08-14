import { createBiometricPaymentRuntime } from "./global-trust-biometric-payment-runtime.mjs";
import { assertBiometricPaymentProductionActivation } from "./global-trust-biometric-payment-production-activation.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function providerIdFor(adapter) {
  return String(adapter?.providerId ?? adapter?.providerName ?? adapter?.name ?? "").trim();
}

export function createCredentialBoundBiometricPaymentRuntime({
  credentialState,
  paymentAdapter,
  externalExecutionApproved = false,
  productionActivation = null,
  ...options
} = {}) {
  if (
    !credentialState
    || typeof credentialState.resolve !== "function"
    || typeof credentialState.append !== "function"
  ) {
    fail(
      "TRUST_PAYMENT_CREDENTIAL_STATE_REQUIRED",
      "credentialState must implement resolve and append",
    );
  }

  if (
    paymentAdapter?.mode === "external"
    && credentialState.durability !== "durable"
  ) {
    fail(
      "TRUST_PAYMENT_CREDENTIAL_DURABLE_STATE_REQUIRED",
      "external payment execution requires durable credential signCount state",
    );
  }

  if (paymentAdapter?.mode === "external" && externalExecutionApproved === true) {
    const providerId = providerIdFor(paymentAdapter);
    if (!providerId) {
      fail(
        "TRUST_PAYMENT_PRODUCTION_ACTIVATION_PROVIDER_REQUIRED",
        "external payment adapter must expose providerId or providerName",
      );
    }
    assertBiometricPaymentProductionActivation(productionActivation ?? {}, { providerId });
  }

  return createBiometricPaymentRuntime({
    ...options,
    credentialResolver: credentialState.resolve,
    credentialStateSink: credentialState,
    paymentAdapter,
    externalExecutionApproved,
  });
}
