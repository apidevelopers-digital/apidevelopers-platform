function jsonResponse(status, payload) {
  return {
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(payload),
  };
}

function readHeader(headers, name) {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === expected) return String(value ?? "").trim() || undefined;
  }
  return undefined;
}

function approvalPath(pathname) {
  const match = pathname.match(/^\/v1\/global-trust\/approvals\/([^/]+)\/resolution$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function createGlobalTrustHumanApprovalHttpApp({
  app,
  authenticator,
  authorization,
  humanApproval,
} = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest must be a function");
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator.authenticate must be a function");
  if (typeof authorization?.decide !== "function") throw new TypeError("authorization.decide must be a function");
  if (typeof humanApproval?.listTenant !== "function") throw new TypeError("humanApproval.listTenant must be a function");
  if (typeof humanApproval?.resolve !== "function") throw new TypeError("humanApproval.resolve must be a function");

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsed = new URL(request.url ?? "/", "http://gateway.local");
      const resolutionRequestId = approvalPath(parsed.pathname);
      const isList = method === "GET" && parsed.pathname === "/v1/global-trust/approvals";
      const isResolve = method === "POST" && Boolean(resolutionRequestId);

      if (!isList && !isResolve) return app.handleRequest(request);

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return jsonResponse(401, { error: "unauthorized" });

      const tenantId = identity.principal?.tenantId;
      if (!tenantId) return jsonResponse(403, { error: "tenant_context_unavailable" });

      const requiredScopes = isResolve ? ["audit:read", "audit:write"] : ["audit:read"];
      const authorizationDecision = authorization.decide({
        identity,
        action: isResolve
          ? "global_trust.human_approval.resolve"
          : "global_trust.human_approval.read",
        resource: `tenant:${tenantId}:global-trust-human-approvals`,
        requiredScopes,
      });
      if (authorizationDecision.effect !== "allow") {
        return jsonResponse(403, {
          error: "forbidden",
          authorizationDecision,
        });
      }

      if (isList) {
        const approvals = await humanApproval.listTenant({ tenantId });
        const status = parsed.searchParams.get("status");
        return jsonResponse(200, {
          tenantId,
          authorizationDecision,
          count: status ? approvals.filter((approval) => approval.status === status).length : approvals.length,
          approvals: status ? approvals.filter((approval) => approval.status === status) : approvals,
        });
      }

      const decision = readHeader(request.headers, "x-approval-decision");
      const reasonCode = readHeader(request.headers, "x-approval-reason") ?? "operator_decision";
      try {
        const approval = await humanApproval.resolve({
          tenantId,
          approvalRequestId: resolutionRequestId,
          identity,
          decision,
          reasonCode,
        });
        return jsonResponse(200, {
          tenantId,
          authorizationDecision,
          approval,
        });
      } catch (error) {
        if (error?.name === "HumanApprovalError") {
          return jsonResponse(error.status ?? 409, {
            error: error.code ?? "human_approval_error",
            message: error.message,
            authorizationDecision,
          });
        }
        if (error instanceof TypeError || error instanceof RangeError) {
          return jsonResponse(400, {
            error: "invalid_approval_resolution",
            message: error.message,
            authorizationDecision,
          });
        }
        throw error;
      }
    },
  });
}
