import { authorize, createAuthenticator } from "@apidevelopers/auth-core";
import { createPortalProjectorHttpAdapter } from "@apidevelopers/portal-projector-http";

function json(status, payload, headers = {}) {
  return {
    status: status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      ...headers,
    },
    body: JSON.stringify(payload),
  };
}

function toGatewayResponse(response) {
  return {
    status: response.status,
    headers: { ...response.headers },
    body: JSON.stringify(response.body),
  };
}

function readApiKey(apiKeyManager, rawKey) {
  if (!rawKey || typeof apiKeyManager?.resolveByRawKey !== "function") return null;
  return apiKeyManager.resolveByRawKey(rawKey);
}

export function createPortalProjectorGatewayRoute({
  readApi,
  apiKeyManager,
  adminKey,
  rateLimiter,
} = {}) {
  if (!readApi || readApi.mutationAllowed !== false) {
    throw new TypeError("readApi must be read-only");
  }
  if (!apiKeyManager || typeof apiKeyManager.resolveByRawKey !== "function") {
    throw new TypeError("apiKeyManager.resolveByRawKey must be a function");
  }
  if (rateLimiter && typeof rateLimiter.check !== "function") {
    throw new TypeError("rateLimiter.check must be a function");
  }

  const authenticator = createAuthenticator({
    adminKey,
    resolveClient: (rawKey) => readApiKey(apiKeyManager, rawKey),
  });

  const adapter = createPortalProjectorHttpAdapter({
    readApi,
    authenticate: async (headers) => authenticator.authenticate(headers),
    authorize: async (identity, context) => authorize(identity, {
      scopes: [context.action],
      requireAllScopes: true,
    }),
  });

  return Object.freeze({
    async handleRequest(request = {}) {
      const rawUrl = request.url ?? request.path ?? "/";
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      if (!pathname.startsWith(adapter.basePath)) return null;

      if (rateLimiter) {
        const key = String(
          request.remoteAddress ??
          request.headers?.["x-forwarded-for"] ??
          request.headers?.["X-Forwarded-For"] ??
          "anonymous",
        );
        const decision = rateLimiter.check(key);
        if (!decision.allowed) {
          return json(429, {
            error: "rate_limited",
            message: "Too many requests.",
          }, {
            "retry-after": String(decision.retryAfterSeconds ?? 1),
          });
        }
      }

      return toGatewayResponse(await adapter.handle(request));
    },
    basePath: adapter.basePath,
    mutationAllowed: false,
  });
}

export function withPortalProjectorRoute({
  app,
  readApi,
  apiKeyManager,
  adminKey,
  rateLimiter,
} = {}) {
  if (!app || typeof app.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  const route = createPortalProjectorGatewayRoute({
    readApi,
    apiKeyManager,
    adminKey,
    rateLimiter,
  });

  return Object.freeze({
    async handleRequest(request) {
      const response = await route.handleRequest(request);
      return response ?? app.handleRequest(request);
    },
  });
}
