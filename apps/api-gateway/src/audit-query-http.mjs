function jsonResponse(status, payload) {
  return {
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(payload),
  };
}

function readQuery(searchParams) {
  return {
    correlationId: searchParams.get("correlationId") ?? undefined,
    action: searchParams.get("action") ?? undefined,
    actorId: searchParams.get("actorId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  };
}

export function createAuditQueryHttpApp({
  app,
  authenticator,
  authorization,
  risk,
  auditQuery,
} = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest must be a function");
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator.authenticate must be a function");
  if (typeof authorization?.decide !== "function") throw new TypeError("authorization.decide must be a function");
  if (typeof risk?.assessAuditQuery !== "function") throw new TypeError("risk.assessAuditQuery must be a function");
  if (typeof auditQuery?.listTenantEvents !== "function") throw new TypeError("auditQuery.listTenantEvents must be a function");

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsed = new URL(request.url ?? "/", "http://gateway.local");
      if (method !== "GET" || parsed.pathname !== "/v1/audit-events") return app.handleRequest(request);

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return jsonResponse(401, { error: "unauthorized" });

      const tenantId = identity.principal?.tenantId;
      if (!tenantId) return jsonResponse(403, { error: "tenant_context_unavailable" });

      const authorizationDecision = authorization.decide({
        identity,
        action: "audit.events.read",
        resource: `tenant:${tenantId}:audit-events`,
        requiredScopes: ["audit:read"],
      });
      if (authorizationDecision.effect !== "allow") {
        return jsonResponse(403, { error: "forbidden", authorizationDecision });
      }

      const query = readQuery(parsed.searchParams);
      const { assessment, safetyDecision } = risk.assessAuditQuery({ identity, query });
      if (safetyDecision.outcome === "deny") {
        return jsonResponse(403, { error: "risk_blocked", authorizationDecision, riskAssessment: assessment, safetyDecision });
      }
      if (safetyDecision.outcome === "pending_approval") {
        return jsonResponse(202, { error: "human_approval_required", authorizationDecision, riskAssessment: assessment, safetyDecision });
      }

      try {
        const events = await auditQuery.listTenantEvents({ tenantId, ...query });
        return jsonResponse(200, {
          tenantId,
          count: events.length,
          authorizationDecision,
          riskAssessment: assessment,
          safetyDecision,
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
