function jsonResponse(status, payload) {
  return {
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(payload),
  };
}

export function createAuditQueryHttpApp({
  app,
  authenticator,
  auditQuery,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (typeof auditQuery?.listTenantEvents !== "function") {
    throw new TypeError("auditQuery.listTenantEvents must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsed = new URL(request.url ?? "/", "http://gateway.local");

      if (method !== "GET" || parsed.pathname !== "/v1/audit-events") {
        return app.handleRequest(request);
      }

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return jsonResponse(401, { error: "unauthorized" });

      const tenantId = identity.principal?.tenantId;
      if (!tenantId) {
        return jsonResponse(403, { error: "tenant_context_unavailable" });
      }

      try {
        const events = await auditQuery.listTenantEvents({
          tenantId,
          correlationId: parsed.searchParams.get("correlationId") ?? undefined,
          action: parsed.searchParams.get("action") ?? undefined,
          actorId: parsed.searchParams.get("actorId") ?? undefined,
          from: parsed.searchParams.get("from") ?? undefined,
          to: parsed.searchParams.get("to") ?? undefined,
          limit: parsed.searchParams.get("limit") ?? undefined,
        });

        return jsonResponse(200, {
          tenantId,
          count: events.length,
          events,
        });
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) {
          return jsonResponse(400, { error: "invalid_query", message: error.message });
        }
        throw error;
      }
    },
  });
}
