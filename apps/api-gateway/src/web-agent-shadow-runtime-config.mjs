import { createWebAgentShadowBrowserComposition } from "./web-agent-shadow-browser-composition.mjs";

export const webAgentShadowRuntimeFlag = "WEB_AGENT_SHADOW_ENABLED";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function enabled(value) {
  return clean(value).toLowerCase() === "true";
}

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

export function resolveWebAgentShadowRuntimeConfig({
  env = process.env,
  dependencies = {},
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!enabled(env?.[webAgentShadowRuntimeFlag])) {
    return Object.freeze({
      enabled: false,
      reason: "shadow_disabled",
      route: undefined,
      composition: undefined,
    });
  }

  const baseUrl = clean(env?.WEB_AGENT_SHADOW_BASE_URL);
  const apiKey = clean(env?.WEB_AGENT_SHADOW_API_KEY);

  if (!baseUrl) {
    throw new TypeError("WEB_AGENT_SHADOW_BASE_URL is required when shadow is enabled");
  }
  if (!apiKey) {
    throw new TypeError("WEB_AGENT_SHADOW_API_KEY is required when shadow is enabled");
  }

  requireFunction(fetchImpl, "fetchImpl");
  requireFunction(dependencies.resolveSessionByHash, "dependencies.resolveSessionByHash");
  requireObject(dependencies.saasAccess, "dependencies.saasAccess");
  requireFunction(
    dependencies.saasAccess.evaluateAccess,
    "dependencies.saasAccess.evaluateAccess",
  );
  requireObject(
    dependencies.tenantInternationalProfile,
    "dependencies.tenantInternationalProfile",
  );
  requireFunction(
    dependencies.tenantInternationalProfile.resolve,
    "dependencies.tenantInternationalProfile.resolve",
  );
  requireObject(dependencies.commercialContext, "dependencies.commercialContext");
  requireFunction(
    dependencies.commercialContext.resolve,
    "dependencies.commercialContext.resolve",
  );

  const shadowRuntime = Object.freeze({
    baseUrl,
    apiKey,
    fetchImpl,
    ...(clean(env?.WEB_AGENT_SHADOW_TIMEOUT_MS)
      ? { timeoutMs: Number(clean(env.WEB_AGENT_SHADOW_TIMEOUT_MS)) }
      : {}),
  });

  if (
    shadowRuntime.timeoutMs !== undefined &&
    (!Number.isInteger(shadowRuntime.timeoutMs) ||
      shadowRuntime.timeoutMs < 100 ||
      shadowRuntime.timeoutMs > 30000)
  ) {
    throw new RangeError(
      "WEB_AGENT_SHADOW_TIMEOUT_MS must be an integer between 100 and 30000",
    );
  }

  const composition = createWebAgentShadowBrowserComposition({
    ...dependencies,
    shadowRuntime,
  });

  return Object.freeze({
    enabled: true,
    reason: "shadow_enabled",
    route: composition.route,
    composition,
  });
}
