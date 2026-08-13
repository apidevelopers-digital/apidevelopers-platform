const DEFAULT_POLICY = Object.freeze({
  enabled: false,
  allowModes: ["sandbox"],
  timeoutMs: 2_500,
  maxAttempts: 1,
  maxAmountMinorByCurrency: {},
  maxTransactionsPerTenantWindow: 10,
  windowMs: 60_000,
});

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail("TRUST_PAYMENT_PROVIDER_CONTROL_INVALID_INPUT", `${name} is required`);
  return normalized;
}

function asPositiveInteger(value, name, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < min || normalized > max) {
    fail("TRUST_PAYMENT_PROVIDER_CONTROL_INVALID_INPUT", `${name} must be an integer between ${min} and ${max}`);
  }
  return normalized;
}

function normalizePolicy(input = {}) {
  const merged = {
    ...DEFAULT_POLICY,
    ...input,
    maxAmountMinorByCurrency: {
      ...DEFAULT_POLICY.maxAmountMinorByCurrency,
      ...input.maxAmountMinorByCurrency,
    },
  };

  if (!Array.isArray(merged.allowModes) || merged.allowModes.length === 0) {
    fail("TRUST_PAYMENT_PROVIDER_CONTROL_INVALID_POLICY", "allowModes must be a non-empty array");
  }

  const allowModes = Object.freeze(merged.allowModes.map((item) => required(item, "allowModes[]")));
  const timeoutMs = asPositiveInteger(merged.timeoutMs, "timeoutMs", { min: 100, max: 120_000 });
  const maxAttempts = asPositiveInteger(merged.maxAttempts, "maxAttempts", { min: 1, max: 3 });
  const maxTransactionsPerTenantWindow = asPositiveInteger(
    merged.maxTransactionsPerTenantWindow,
    "maxTransactionsPerTenantWindow",
    { min: 1, max: 10_000 },
  );
  const windowMs = asPositiveInteger(merged.windowMs, "windowMs", { min: 1_000, max: 86_400_000 });

  const maxAmountMinorByCurrency = {};
  for (const [currency, rawLimit] of Object.entries(merged.maxAmountMinorByCurrency)) {
    maxAmountMinorByCurrency[required(currency, "currency")] = asPositiveInteger(
      rawLimit,
      `maxAmountMinorByCurrency.${currency}`,
    );
  }

  return Object.freeze({
    enabled: merged.enabled === true,
    allowModes,
    timeoutMs,
    maxAttempts,
    maxAmountMinorByCurrency: Object.freeze(maxAmountMinorByCurrency),
    maxTransactionsPerTenantWindow,
    windowMs,
  });
}

function requireProvider(provider) {
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
    fail("TRUST_PAYMENT_PROVIDER_CONTROL_INVALID_PROVIDER", "provider must be an object");
  }
  const mode = required(provider.mode, "provider.mode");
  const name = required(provider.name ?? "unnamed", "provider.name");
  if (typeof provider.authorize !== "function") {
    fail("TRUST_PAYMENT_PROVIDER_CONTROL_INVALID_PROVIDER", "provider.authorize must be a function");
  }
  if (provider.idempotencyGuaranteed !== true) {
    fail(
      "TRUST_PAYMENT_PROVIDER_CONTROL_IDEMPOTENCY_REQUIRED",
      "provider must guarantee idempotency by idempotencyKey",
    );
  }
  return { provider, mode, name };
}

function timeoutPromise(ms, controller) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      controller?.abort?.();
      const error = new Error("payment provider timed out");
      error.code = "TRUST_PAYMENT_PROVIDER_TIMEOUT";
      error.retryable = true;
      reject(error);
    }, ms);
    timer.unref?.();
  });
}

async function withTimeout(operation, ms) {
  const controller = new AbortController();
  const work = Promise.resolve().then(() => operation(controller.signal));
  return Promise.race([work, timeoutPromise(ms, controller)]);
}

export function createBiometricPaymentProviderControl({
  provider: providerInput,
  policy: policyInput = {},
  nowMs = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const { provider, mode, name } = requireProvider(providerInput);
  const policy = normalizePolicy(policyInput);
  const tenantWindows = new Map();
  let killSwitch = false;
  let killReason = null;

  function assertEnabled() {
    if (!policy.enabled) {
      fail("TRUST_PAYMENT_PROVIDER_DISABLED", "payment provider is disabled by policy");
    }
    if (killSwitch) {
      fail(
      "TRUST_PAYMENT_PROVIDER_KILL_SWITCH",
      `payment provider is disabled by kill switch${killReason ? `: ${killReason}` : ""}`,
    );
    }
    if (!policy.allowModes.includes(mode)) {
    fail("TRUST_PAYMENT_PROVIDER_MODE_BLOCKED", `provider mode ${mode} is not allowed by current policy`);
    }
  }

  function checkAmount(request) {
    const currency = required(request?.currency, "request.currency");
    const amountMinor = asPositiveInteger(request?.amountMinor, "request.amountMinor");
    const limit = policy.maxAmountMinorByCurrency[currency];
    if (limit != null && amountMinor > limit) {
      fail(
      "TRUST_PAYMENT_PROVIDER_AMOUNT_LIMIT",
      `amountMinor exceeds configured limit for ${currency}`,
    );
    }
  }

  function reserveTenantWindow(request) {
    const tenantId = required(request?.tenantId, "request.tenantId");
    const now = Number(nowMs());
    if (!Number.isFinite(now)) fail("TRUST_PAYMENT_PROVIDER_CLOCK_INVALID", "nowMs must return a number");

    const current = tenantWindows.get(tenantId);
    const active = current && now - current.startedAt < policy.windowMs
      ? current
      : { startedAt: now, count: 0 };

    if (active.count >= policy.maxTransactionsPerTenantWindow) {
      fail(
        "TRUST_PAYMENT_PROVIDER_TENANT_RATE_LIMIT",
        "tenant transaction window limit exceeded",
      );
    }

    active.count += 1;
    tenantWindows.set(tenantId, active);
  }

  async function health() {
    if (killSwitch) {
      return Object.freeze({
      status: "disabled",
      provider: name,
      mode,
      killSwitch: true,
      reason: killReason,
    });
  }

    if (typeof provider.health !== "function") {
      return Object.freeze({
      status: policy.enabled && policy.allowModes.includes(mode) ? "unknown" : "disabled",
      provider: name,
      mode,
      killSwitch: false,
    });
  }

  const result = await withTimeout((signal) => provider.health({ signal }), policy.timeoutMs);
  return Object.freeze({
    provider: name,
    mode,
    killSwitch: false,
    ...(result && typeof result === "object" ? result : { status: "unknown" }),
  });
  }

  async function readiness() {
    if (!policy.enabled || killSwitch || !policy.allowModes.includes(mode)) {
      return Object.freeze({
        ready: false,
        provider: name,
        mode,
        reason: killSwitch ? "kill_switch" : "policy_disabled",
      });
    }

    if (typeof provider.readiness !== "function") {
      return Object.freeze({
        ready: false,
        provider: name,
        mode,
        reason: "provider_readiness_unavailable",
      });
    }

    const result = await withTimeout((signal) => provider.readiness({ signal }), policy.timeoutMs);
    return Object.freeze({
      provider: name,
      mode,
      ...(result && typeof result === "object" ? result : { ready: false }),
    });
  }

  async function authorize(request = {}) {
    assertEnabled();
    checkAmount(request);
    reserveTenantWindow(request);

    const idempotencyKey = required(request.idempotencyKey, "request.idempotencyKey");
    let lastError;

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      try {
        const result = await withTimeout(
          (signal) => provider.authorize({ ...request, idempotencyKey, signal }),
          policy.timeoutMs,
        );

        if (!result || typeof result !== "object") {
          fail("TRUST_PAYMENT_PROVIDER_INVALID_RESPONSE", "provider returned an invalid response");
        }

        return Object.freeze({
          ...result,
          control: Object.freeze({
            provider: name,
            mode,
            attempt,
            maxAttempts: policy.maxAttempts,
            timeoutMs: policy.timeoutMs,
          }),
        });
      } catch (error) {
        lastError = error;
        const retryable = error?.retryable === true || error?.code === "TRUST_PAYMENT_PROVIDER_TIMEOUT";
        const safeRetry = provider.safeRetryAfterTransportFailure === true;
        if (!retryable || !safeRetry || attempt >= policy.maxAttempts) break;
        await sleep(Math.min(25 * attempt, 100));
      }
    }

    throw lastError;
  }

  function engageKillSwitch(reason = "manual") {
    killSwitch = true;
    killReason = required(reason, "reason");
    return Object.freeze({ disabled: true, reason: killReason });
  }

  function resetKillSwitch() {
    killSwitch = false;
    killReason = null;
    return Object.freeze({ disabled: false });
  }

  return Object.freeze({
    providerName: name,
    providerMode: mode,
    policy,
    authorize,
    health,
    readiness,
    engageKillSwitch,
    resetKillSwitch,
    status() {
      return Object.freeze({
      enabledByPolicy: policy.enabled,
      allowedMode: policy.allowModes.includes(mode),
      killSwitch,
      killReason,
    });
  },
  });
}
