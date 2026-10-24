function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
}

function normalizeBinding(input = {}) {
  const priceId = requireText(input.priceId, "priceId").toLowerCase();
  const provider = requireText(input.provider, "provider").toLowerCase();
  const environment = requireText(input.environment, "environment").toLowerCase();
  const providerPlanId = requireText(input.providerPlanId, "providerPlanId");
  const checkoutUrl = new URL(requireText(input.checkoutUrl, "checkoutUrl"));
  const status = requireText(input.status ?? "active", "status").toLowerCase();

  if (!["test", "live"].includes(environment)) {
    throw new TypeError("environment must be test or live");
  }
  if (!["active", "disabled"].includes(status)) {
    throw new TypeError("status must be active or disabled");
  }
  if (checkoutUrl.protocol !== "https:") {
    throw new TypeError("checkoutUrl must use https");
  }

  return Object.freeze({
    priceId,
    provider,
    environment,
    providerPlanId,
    checkoutUrl: checkoutUrl.toString(),
    status,
  });
}

function keyOf({ priceId, provider, environment }) {
  return [
    requireText(provider, "provider").toLowerCase(),
    requireText(environment, "environment").toLowerCase(),
    requireText(priceId, "priceId").toLowerCase(),
  ].join(":");
}

export function createProviderPlanRegistry(bindings = []) {
  if (!Array.isArray(bindings)) throw new TypeError("bindings must be an array");

  const normalized = bindings.map(normalizeBinding);
  const byKey = new Map();

  for (const binding of normalized) {
    const key = keyOf(binding);
    if (byKey.has(key)) throw new Error(`duplicate provider plan binding: ${key}`);
    byKey.set(key, binding);
  }

  return Object.freeze({
    resolve(input = {}) {
      const key = keyOf(input);
      const binding = byKey.get(key);
      if (!binding || binding.status !== "active") {
        throw new Error("provider_plan_binding_not_found");
      }
      return binding;
    },
    list() {
      return Object.freeze([...normalized]);
    },
  });
}
