import { createWebAgentConversationHttpRoute } from "./web-agent-conversation-http.mjs";
import { resolveWebAgentShadowRuntimeConfig } from "./web-agent-shadow-runtime-config.mjs";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

function requireRoute(route, name) {
  if (
    !route ||
    typeof route !== "object" ||
    typeof route.handle !== "function" ||
    typeof route.readBody !== "function"
  ) {
    throw new TypeError(`${name} must provide handle and readBody`);
  }
  return route;
}

export function createWebAgentServerBootstrap({
  env = process.env,
  dependencies = {},
  fetchImpl = globalThis.fetch,
  resolveShadowRuntimeConfig = resolveWebAgentShadowRuntimeConfig,
  createFallbackRoute = createWebAgentConversationHttpRoute,
} = {}) {
  requireFunction(resolveShadowRuntimeConfig, "resolveShadowRuntimeConfig");
  requireFunction(createFallbackRoute, "createFallbackRoute");

  const fallbackRoute = requireRoute(createFallbackRoute(), "fallback route");
  const shadow = resolveShadowRuntimeConfig({ env, dependencies, fetchImpl });

  if (!shadow || typeof shadow !== "object") {
    throw new TypeError("shadow runtime config must return an object");
  }

  if (shadow.enabled !== true) {
    return Object.freeze({
      enabled: false,
      mode: "dark",
      reason:
        typeof shadow.reason === "string" && shadow.reason
          ? shadow.reason
          : "shadow_disabled",
      route: fallbackRoute,
    });
  }

  const route = requireRoute(shadow.route, "shadow route");

  return Object.freeze({
    enabled: true,
    mode: "shadow",
    reason:
      typeof shadow.reason === "string" && shadow.reason
        ? shadow.reason
        : "shadow_enabled",
    route,
  });
}
