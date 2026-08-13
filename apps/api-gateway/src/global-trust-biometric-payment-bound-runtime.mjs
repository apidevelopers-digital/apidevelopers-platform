import { createBiometricPaymentRuntime } from "./global-trust-biometric-payment-runtime.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function createCredentialBoundBiometricPaymentRuntime({
  credentialState,
  paymentAdapter,
  externalExecutionApproved = false,
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

  return createBiometricPaymentRuntime({
    ...options,
    credentialResolver: credentialState.resolve,
    credentialStateSink: credentialState,
    paymentAdapter,
    externalExecutionApproved,
  });
}
