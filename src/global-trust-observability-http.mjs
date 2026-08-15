function jsonResponse(status, payload) {
  return {
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(payload),
  };
}

export function createGlobalTrustObservabilityHttpApp({
  app,
  authenticator,
  authorization,
  observability,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (typeof authorization?.decide !== "function") {
    throw new TypeError("authorization.decide must be a function");
  }
  if (typeof observability?.snapshotTenant !== "function") {
    throw new TypeError("observability.snapshotTenant must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsed = new URL(request.url ?? "/", "http://gateway.local");

      if (method !== "GET" || parsed.pathname !== "/v1/global-trust/observability") {
        return app.handleRequest(request);
      }

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return jsonResponse(401, { error: "unauthorized" });

      const tenantId = identity.principal?.tenantId;
      if (!tenantId) return jsonResponse(403, { error: "tenant_context_unavailable" });

      const authorizationDecision = authorization.decide({
        identity,
        action: "global_trust.observability.read",
        resource: `tenant:${tenantId}:global-trust-observability`,
        requiredScopes: ["audit:read"],
      });
      if (authorizationDecision.effect !== "allow") {
        return jsonResponse(403, {
          error: "forbidden",
          authorizationDecision,
        });
      }

      const snapshot = await observability.snapshotTenant({ tenantId });
      return jsonResponse(200, {
        tenantId,
        authorizationDecision,
        snapshot,
      });
    },
  });
}
