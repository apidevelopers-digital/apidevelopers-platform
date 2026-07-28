
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

function readHeader(headers, name) {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === expected) return String(value ?? "").trim() || undefined;
  }
  return undefined;
}

export function createAuditQueryHttpApp({
  app,
  authenticator,
  authorization,
  risk,
  decisionEvidence,
  auditQuery,
} = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest must be a function");
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator.authenticate must be a function");
  if (typeof authorization?.decide !== "function") throw new TypeError("authorization.decide must be a function");
  if (typeof risk?.assessAuditQuery !== "function") throw new TypeError("risk.assessAuditQuery must be a function");
  if (typeof decisionEvidence?.createCorrelationId !== "function") {
    throw new TypeError("decisionEvidence.createCorrelationId must be a function");
  }
  if (typeof decisionEvidence?.persistDecisionEvidence !== "function") {
    throw new TypeError("decisionEvidence.persistDecisionEvidence must be a function");
  }
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

      const correlationId = readHeader(request.headers, "x-correlation-id")
        ?? decisionEvidence.createCorrelationId();

      const authorizationDecision = authorization.decide({
        identity,
        action: "audit.events.read",
        resource: `tenant:${tenantId}:audit-events`,
        requiredScopes: ["audit:read"],
      });

      if (authorizationDecision.effect !== "allow") {
        const evidence = await decisionEvidence.persistDecisionEvidence({
          correlationId,
          outcome: "authorization_denied",
          authorizationDecision,
        });
        return jsonResponse(403, {
          error: "forbidden",
          correlationId,
          authorizationDecision,
          decisionEvidence: evidence,
        });
      }

      const query = readQuery(parsed.searchParams);
      const { assessment, safetyDecision } = risk.assessAuditQuery({ identity, query });

      if (safetyDecision.outcome === "deny") {
        const evidence = await decisionEvidence.persistDecisionEvidence({
          correlationId,
          outcome: "risk_blocked",
          authorizationDecision,
          riskAssessment: assessment,
          safetyDecision,
        });
        return jsonResponse(403, {
          error: "risk_blocked",
          correlationId,
          authorizationDecision,
          riskAssessment: assessment,
          safetyDecision,
          decisionEvidence: evidence,
        });
      }

      if (safetyDecision.outcome === "pending_approval") {
        const evidence = await decisionEvidence.persistDecisionEvidence({
          correlationId,
          outcome: "human_approval_required",
          authorizationDecision,
          riskAssessment: assessment,
          safetyDecision,
        });
        return jsonResponse(202, {
          error: "human_approval_required",
          correlationId,
          authorizationDecision,
          riskAssessment: assessment,
          safetyDecision,
          decisionEvidence: evidence,
        });
      }

      try {
        const events = await auditQuery.listTenantEvents({ tenantId, ...query });
        const evidence = await decisionEvidence.persistDecisionEvidence({
          correlationId,
          outcome: "allowed",
          authorizationDecision,
          riskAssessment: assessment,
          safetyDecision,
          eventIds: events.map((event) => event.eventId),
        });
        return jsonResponse(200, {
          tenantId,
          correlationId,
          count: events.length,
          authorizationDecision,
          riskAssessment: assessment,
          safetyDecision,
          decisionEvidence: evidence,
          events,
        });
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) {
          const evidence = await decisionEvidence.persistDecisionEvidence({
            correlationId,
            outcome: "invalid_query",
            authorizationDecision,
            riskAssessment: assessment,
            safetyDecision,
          });
          return jsonResponse(400, {
            error: "invalid_query",
            message: error.message,
            correlationId,
            decisionEvidence: evidence,
          });
        }
        throw error;
      }
    },
  });
}
