function readText(env, name) {
  const value = env?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireText(env, name) {
  const value = readText(env, name);
  if (!value) throw new Error(`missing billing configuration: ${name}`);
  return value;
}

function readEnabled(env, name) {
  const value = readText(env, name);
  if (value === null) return false;
  return value.toLowerCase() === "true";
}

export function readSaasBillingConfig(env = {}) {
  const enabled = readEnabled(env, "APD_BILLING_ENABLED");
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      provider: null,
      mode: null,
      catalogPath: null,
      secretEnvNames: Object.freeze([]),
    });
  }

  const provider = requireText(env, "APD_BILLING_PROVIDER").toLowerCase();
  if (provider !== "mercadopago") {
    throw new Error(`unsupported billing provider: ${provider}`);
  }

  const mode = requireText(env, "APD_BILLING_MODE").toLowerCase();
  if (!["test", "live"].includes(mode)) {
    throw new Error("APD_BILLING_MODE must be test or live");
  }

  const catalogPath = requireText(env, "APD_BILLING_CATALOG_PATH");
  const secretEnvNames = ["MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET"];
  for (const name of secretEnvNames) requireText(env, name);

  if (mode === "live" && !readEnabled(env, "APD_BILLING_LIVE_ENABLED")) {
    throw new Error("live billing requires explicit APD_BILLING_LIVE_ENABLED=true");
  }

  return Object.freeze({
    enabled: true,
    provider,
    mode,
    catalogPath,
    secretEnvNames: Object.freeze([...secretEnvNames]),
  });
}
