import { createBiometricPaymentExecutionAdapter } from "./global-trust-biometric-payment-execution.mjs";
import { createBiometricPaymentProviderControl } from "./global-trust-biometric-payment-provider-control.mjs";
import { createBiometricPaymentProviderOperations } from "./global-trust-biometric-payment-provider-operations.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireSandboxProvider(provider) {
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
    fail("TRUST_PAYMENT_OPERATIONAL_SANDBOX_PROVIDER_INVALID", "provider must be an object");
  }
  if (provider.mode !== "sandbox") {
    fail("TRUST_PAYMENT_OPERATIONAL_SANDBOX_REQUIRED", "operational composition accepts sandbox providers only");
  }
  if (provider.financialExecutionCapable === true) {
    fail("TRUST_PAYMENT_OPERATIONAL_REAL_MONEY_BLOCKED", "real-money-capable provider cannot enter sandbox operational composition");
  }
  if (provider.idempotencyGuaranteed !== true || typeof provider.authorize !== "function") {
    fail("TRUST_PAYMENT_OPERATIONAL_PROVIDER_CONTRACT_INVALID", "provider must guarantee idempotency and implement authorize");
  }
  return provider;
}

export function createOperationalSandboxBiometricPaymentExecutionAdapter({
  store,
  provider: providerInput,
  controlPolicy = {},
  operationalPolicy = {},
  telemetrySink,
  incidentSink,
  controlFactory = createBiometricPaymentProviderControl,
  operationsFactory = createBiometricPaymentProviderOperations,
  nowMs = () => Date.now(),
  sleep,
  ...executionOptions
} = {}) {
  const provider = requireSandboxProvider(providerInput);

  const control = controlFactory({
    provider,
    policy: {
      enabled: true,
      allowModes: ["sandbox"],
      ...controlPolicy,
    },
    nowMs,
    ...(sleep ? { sleep } : {}),
  });

  const operations = operationsFactory({
    control,
    telemetrySink,
    incidentSink,
    policy: operationalPolicy,
    nowMs,
  });

  const operationalProvider = Object.freeze({
    mode: "sandbox",
    name: String(provider.name ?? "unnamed"),
    idempotencyGuaranteed: true,
    financialExecutionCapable: false,

    async authorize(request) {
      return operations.authorize({
        ...request,
        correlationId: request.correlationId ?? request.paymentIntentId,
      });
    },

    async getStatus(request) {
      if (typeof provider.getStatus !== "function") {
        fail("TRUST_PAYMENT_OPERATIONAL_RECONCILIATION_UNAVAILABLE", "sandbox provider does not support reconciliation");
      }
      return provider.getStatus(request);
    },
  });

  const executionAdapter = createBiometricPaymentExecutionAdapter({
    ...executionOptions,
    store,
    provider: operationalProvider,
  });

  return Object.freeze({
    mode: executionAdapter.mode,
    providerMode: "sandbox",
    providerName: operationalProvider.name,
    durability: executionAdapter.durability,
    idempotencyGuaranteed: true,
    contactEnabled: false,
    authorize: executionAdapter.authorize,
    get: executionAdapter.get,
    reconcile: executionAdapter.reconcile,
    health: operations.health,
    readiness: operations.readiness,
    operationalStatus: operations.status,
    resetCircuit: operations.resetCircuit,
  });
}
