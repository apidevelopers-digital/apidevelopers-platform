function jsonResponse(status, payload) {
  return {
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
    }),
    body: JSON.stringify(payload),
  };
}

function parseJsonBody(body) {
  if (body === undefined || body === null || body === "") {
    throw new TypeError("request body is required");
  }

  if (
    typeof body === "object"
    && !Buffer.isBuffer(body)
    && !Array.isArray(body)
  ) {
    return body;
  }

  const text = Buffer.isBuffer(body)
    ? body.toString("utf8")
    : String(body);
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("request body must be a JSON object");
  }
  return parsed;
}

export function createGlobalTrustToolInvocationHttpApp({
  app,
  authenticator,
  authorization,
  guard,
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
  if (typeof guard?.evaluate !== "function") {
    throw new TypeError("guard.evaluate must be a function");
  }
  if (typeof guard?.listTenant !== "function") {
    throw new TypeError("guard.listTenant must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsedUrl = new URL(
        request.url ?? "/",
        "http://gateway.local",
      );
      const isEvaluate =
        method === "POST"
        && parsedUrl.pathname === "/v1/global-trust/tool-invocations/evaluate";
      const isList =
        method === "GET"
        && parsedUrl.pathname === "/v1/global-trust/tool-invocations/decisions";

      if (!isEvaluate && !isList) return app.handleRequest(request);

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return jsonResponse(401, { error: "unauthorized" });

      const tenantId = identity.principal?.tenantId;
      if (!tenantId) {
        return jsonResponse(403, { error: "tenant_context_unavailable" });
      }

      const requiredScopes = isEvaluate ? ["tool:invoke"] : ["audit:read"];
      const authorizationDecision = authorization.decide({
        identity,
        action: isEvaluate
          ? "global_trust.tool_invocation.evaluate"
          : "global_trust.tool_invocation.read",
        resource: `tenant:${tenantId}:global-trust-tool-invocations`,
        requiredScopes,
      });

      if (authorizationDecision.effect !== "allow") {
        return jsonResponse(403, {
          error: "forbidden",
          authorizationDecision,
        });
      }

      if (isList) {
        try {
          const decisions = await guard.listTenant({
            tenantId,
            limit: parsedUrl.searchParams.get("limit") ?? 100,
          });
          return jsonResponse(200, {
            tenantId,
            authorizationDecision,
            count: decisions.length,
            decisions,
            sensitiveContentIncluded: false,
          });
        } catch (error) {
          if (error instanceof TypeError || error instanceof RangeError) {
            return jsonResponse(400, {
              error: "invalid_tool_invocation_query",
              message: error.message,
              authorizationDecision,
            });
          }
          throw error;
        }
      }

      try {
        const body = parseJsonBody(request.body);
        const decision = await guard.evaluate({
          identity,
          proposal: {
            toolId: body.toolId,
            action: body.action,
            useCase: body.useCase,
            callCount: body.callCount,
            executionClass: body.executionClass,
            arguments: body.arguments,
            correlationId:
              body.correlationId
              ?? request.headers?.["x-correlation-id"]
              ?? request.headers?.["x-request-id"],
          },
        });

        const status = decision.outcome === "allow"
          ? 200
          : decision.outcome === "pending_approval"
            ? 202
            : 403;

        return jsonResponse(status, {
          tenantId,
          authorizationDecision,
          decision,
          executed: false,
          executorAvailable: false,
          sensitiveContentIncluded: false,
        });
      } catch (error) {
        if (
          error instanceof SyntaxError
          || error instanceof TypeError
          || error instanceof RangeError
        ) {
          return jsonResponse(400, {
            error: "invalid_tool_invocation_request",
            message: error.message,
            authorizationDecision,
          });
        }
        throw error;
      }
    },
  });
}
