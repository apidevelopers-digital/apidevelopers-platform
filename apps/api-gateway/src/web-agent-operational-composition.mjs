import { createSaasAccessComposition } from "./saas-access-composition.mjs";
import { createWebAgentBrowserComposition } from "./web-agent-browser-composition.mjs";
import { createWebAgentShadowConversationService } from "./web-agent-shadow-client.mjs";
import { createWebAgentShadowMemoryProvider } from "./web-agent-shadow-memory-provider.mjs";
import { createWebAgentShadowMemoryReadOnlyConversationService } from "./web-agent-shadow-memory-readonly-service.mjs";
import { createWebAgentShadowPersistenceProviders } from "./web-agent-shadow-persistence-providers.mjs";

function flag(value, name) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "false") return false;
  if (normalized === "true") return true;
  throw new TypeError(`${name} must be true or false`);
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required when WEB_AGENT_SHADOW_ENABLED=true`);
  return normalized;
}

function pathnameOf(url) {
  return new URL(String(url ?? "/"), "http://api-gateway.local").pathname;
}

function invalidOperationalResponse() {
  const payload = Object.freeze({ error: "invalid_web_agent_http_response" });
  return Object.freeze({
    status: 502,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(payload),
    payload,
  });
}

export function toOperationalResponse(response) {
  if (!response || typeof response !== "object" || !Number.isInteger(response.status)) {
    return invalidOperationalResponse();
  }
  if (typeof response.body !== "string") {
    return invalidOperationalResponse();
  }
  try {
    const payload = JSON.parse(response.body);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return invalidOperationalResponse();
    }
    const headers =
      response.headers && typeof response.headers === "object"
        ? response.headers
        : Object.freeze({});
    return Object.freeze({
      status: response.status,
      headers,
      body: response.body,
      payload,
    });
  } catch {
    return invalidOperationalResponse();
  }
}

function invalidJsonResponse() {
  const payload = Object.freeze({ error: "invalid_json" });
  return Object.freeze({
    status: 400,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(payload),
    payload,
  });
}

export function parseOperationalConversationBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  if (typeof body !== "string" || body.trim() === "") {
    throw new TypeError("invalid_json");
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new TypeError("invalid_json");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("invalid_json");
  }
  return parsed;
}

function browserNow(clock) {
  return () => {
    const value = clock();
    const current = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(current.getTime())) {
      throw new TypeError("clock must return a valid Date-compatible value");
    }
    return current;
  };
}

export function createWebAgentOperationalComposition({
  app,
  store,
  env = process.env,
  fetchImpl = globalThis.fetch,
  clock,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    throw new TypeError(store must provide read and transaction);
  }

  const enabled = flag(env.WEB_AGENT_SHADOW_ENABLED, "WEB_AGENT_SHADOW_ENABLED");
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      app,
      descriptor: Object.freeze({ enabled: false, mode: "shadow" }),
    });
  }

  const baseUrl = required(env.WEB_AGENT_SHADOW_BASE_URL, "WEB_AGENT_SHADOW_BASE_URL");
  const apiKey = required(env.WEB_AGENT_SHADOW_API_KEY, "WEB_AGENT_SHADOW_API_KEY");
  const allowInsecureHttp = flag(
    env.WEB_AGENT_SHADOW_ALLOW_INSECURE_HTTP,
    "WEB_AGENT_SHADOW_ALLOW_INSECURE_HTTP",
  );

  const providers = createWebAgentShadowPersistenceProviders({store});
  const memoryProvider = createWebAgentShadowMemoryProvider({ store });
  const { saasRuntime, membershipRuntime } = createSaasAccessComposition({
    store,
    ...(clock ? { clock } : {}),
  });
  const shadowService = createWebAgentShadowConversationService({
    baseUrl,
    apiKey,
    fetchImpl,
    allowInsecureHttp,
  });
  const conversationService =
    createWebAgentShadowMemoryReadOnlyConversationService({
      memoryProvider,
      conversationService: shadowService,
    });
  const browser = createWebAgentBrowserComposition({
    resolveSessionByHash: providers.resolveSessionByHash,
    saasRuntime,
    membershipRuntime,
    tenantInternationalProfile: providers.tenantInternationalProfile,
    commercialContext: providers.commercialContext,
    conversationService,
    ...(clock ? { now: browserNow(clock) } : {}),
  });

  const wrappedApp = Object.freeze({
    async handleRequest(request = {}) {
      if (pathnameOf(request.url) === "/v1/web-agent/conversations") {
        let body;
        try {
          body = parseOperationalConversationBody(request.body);
        } catch {
          return invalidJsonResponse();
        }
        const response = await browser.route.handle({ ...request, body });
        return toOperationalResponse(response);
      }
      return app.handleRequest(request);
    },
  });

  return Object.freeze({
    enabled: true,
    app: wrappedApp,
    browser,
    memoryProvider,
    descriptor: Object.freeze({
      enabled: true,
      mode: "shadow",
      memory: "read_only",
      officialSurfaceBinding: true,
      externalExecution: false,
    }),
  });
}
