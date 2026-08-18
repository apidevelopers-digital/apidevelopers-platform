import { createBiometricPaymentProviderControl } from "./global-trust-biometric-payment-provider-control.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function required(value, name) {
  const v = String(value ?? "").trim();
  if (!v) fail("TRUST_PAYMENT_PROVIDER_CERTIFICATION_INVALID_INPUT", `${name} is required`);
  return v;
}

function asObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("TRUST_PAYMENT_PROVIDER_CERTIFICATION_INVALID_INPUT", `${name} must be an object`);
  }
  return value;
}

async function blocked(operation, code) {
  try {
    await operation();
    return Object.freeze({ passed: false, observed: "not_blocked" });
  } catch (error) {
    return Object.freeze({
      passed: error?.code === code,
      observed: error?.code ?? "unknown",
    });
  }
}

function stable(left, right) {
  return Boolean(
    left
    && right
    && left.status === right.status
    && left.providerReference === right.providerReference
    && (left.providerCode ?? null) === (right.providerCode ?? null)
  );
}

export async function certifyBiometricPaymentSandboxProvider({
  provider: providerInput,
  request: requestInput,
  policy: policyInput = {},
  controlFactory = createBiometricPaymentProviderControl,
} = {}) {
  const provider = asObject(providerInput, "provider");
  const request = asObject(requestInput, "request");
  const profile = Object.freeze({
    name: required(provider.name ?? "unnamed", "provider.name"),
    mode: required(provider.mode, "provider.mode"),
    idempotencyGuaranteed: provider.idempotencyGuaranteed === true,
    safeRetryAfterTransportFailure: provider.safeRetryAfterTransportFailure === true,
    financialExecutionCapable: provider.financialExecutionCapable === true,
  });

  if (profile.mode !== "sandbox") {
    fail("TRUST_PAYMENT_PROVIDER_CERTIFICATION_SANDBOX_REQUIRED", "certification accepts sandbox providers only");
  }
  if (profile.financialExecutionCapable) {
    fail("TRUST_PAYMENT_PROVIDER_CERTIFICATION_REAL_MONEY_BLOCKED", "real-money-capable provider cannot run in sandbox certification");
  }
  if (!profile.idempotencyGuaranteed) {
    fail("TRUST_PAYMENT_PROVIDER_CERTIFICATION_IDEMPOTENCY_REQUIRED", "provider must guarantee idempotency");
  }

  const policy = {
    enabled: true,
    allowModes: ["sandbox"],
    timeoutMs: 2500,
    maxAttempts: 1,
    maxTransactionsPerTenantWindow: 20,
    windowMs: 60000,
    ...policyInput,
  };
  const control = controlFactory({ provider, policy });
  const checks = [];

  const health = await control.health();
  checks.push(Object.freeze({ id: "health", passed: health?.status === "healthy", observed: health?.status ?? "unknown" }));

  const readiness = await control.readiness();
  checks.push(Object.freeze({ id: "readiness", passed: readiness?.ready === true, observed: readiness?.ready === true ? "ready" : "not_ready" }));

  const first = await control.authorize(request);
  const duplicate = await control.authorize(request);
  checks.push(Object.freeze({ id: "idempotency", passed: stable(first, duplicate), observed: stable(first, duplicate) ? "stable" : "divergent" }));

  const key = required(request.idempotencyKey, "request.idempotencyKey");

  control.engageKillSwitch("certification.kill-switch");
  checks.push(Object.freeze({
    id: "kill_switch",
    ...(await blocked(() => control.authorize({ ...request, idempotencyKey: `${key}.kill` }), "TRUST_PAYMENT_PROVIDER_KILL_SWITCH")),
  }));
  control.resetKillSwitch();

  const disabled = controlFactory({ provider, policy: { ...policy, enabled: false } });
  checks.push(Object.freeze({
    id: "deny_by_default",
    ...(await blocked(() => disabled.authorize({ ...request, idempotencyKey: `${key}.disabled` }), "TRUST_PAYMENT_PROVIDER_DISABLED")),
  }));

  const external = controlFactory({
    provider: { ...provider, mode: "external" },
    policy: { ...policy, enabled: true, allowModes: ["sandbox"] },
  });
  checks.push(Object.freeze({
    id: "external_mode_blocked",
    ...(await blocked(() => external.authorize({ ...request, idempotencyKey: `${key}.external` }), "TRUST_PAYMENT_PROVIDER_MODE_BLOCKED")),
  }));

  const limit = Number(policy.maxAmountMinorByCurrency?.[request.currency]);
  if (Number.isSafeInteger(limit) && limit > 0) {
    const amountControl = controlFactory({ provider, policy });
    checks.push(Object.freeze({
      id: "amount_limit",
      ...(await blocked(
        () => amountControl.authorize({ ...request, amountMinor: limit + 1, idempotencyKey: `${key}.amount` }),
        "TRUST_PAYMENT_PROVIDER_AMOUNT_LIMIT",
      )),
    }));
  } else {
    checks.push(Object.freeze({ id: "amount_limit", passed: false, observed: "limit_not_configured" }));
  }

  const passed = checks.every((check) => check.passed === true);
  const report = Object.freeze({
    type: "BiometricPaymentProviderCertificationReport",
    version: "1.0.0",
    provider: profile,
    scope: Object.freeze({
      sandboxOnly: true,
      realMoneyExecution: false,
      rawBiometricDataIncluded: false,
      secretsIncluded: false,
    }),
    checks: Object.freeze(checks),
    status: passed ? "certified" : "failed",
  });

  if (!passed) {
    const error = new Error("sandbox provider certification failed");
    error.code = "TRUST_PAYMENT_PROVIDER_CERTIFICATION_FAILED";
    error.report = report;
    throw error;
  }

  return report;
}
