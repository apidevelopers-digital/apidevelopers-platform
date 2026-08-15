const CONFIRMATION = "IGOR_APROVA_EXECUCAO";
const KEYS = new Set(["output","sourceType","useCaseId","dataPolicyId","modelId","correlationId"]);

function response(status, payload) {
  return { status, headers: Object.freeze({"content-type":"application/json; charset=utf-8"}), body: JSON.stringify(payload) };
}

function header(headers, name) {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === expected) return String(value ?? "").trim() || undefined;
  }
  return undefined;
}

function bodyOf(body) {
  if (body === undefined || body === null || body === "") throw new TypeError("request body is required");
  const parsed = typeof body === "object" && !Buffer.isBuffer(body) && !Array.isArray(body)
    ? body
    : JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : String(body));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("request body must be a JSON object");
  }
  const unknown = Object.keys(parsed).filter((key) => !KEYS.has(key));
  if (unknown.length) throw new TypeError(`request contains unsupported fields: ${unknown.sort().join(", ")}`);
  return parsed;
}

export function createGlobalTrustOutputValidatorHttpApp({
  app, authenticator, authorization, outputValidator, integrity,
} = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest must be a function");
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator.authenticate must be a function");
  if (typeof authorization?.decide !== "function") throw new TypeError("authorization.decide must be a function");
  if (typeof outputValidator?.evaluate !== "function") throw new TypeError("outputValidator.evaluate must be a function");
  if (typeof outputValidator?.listTenant !== "function") throw new TypeError("outputValidator.listTenant must be a function");
  if (typeof integrity?.verifyTenant !== "function") throw new TypeError("integrity.verifyTenant must be a function");

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const url = new URL(request.url ?? "/", "http://gateway.local");
      const evaluate = method === "POST" && url.pathname === "/v1/global-trust/output-validator/evaluate";
      const list = method === "GET" && url.pathname === "/v1/global-trust/output-validator/decisions";
      const verify = method === "GET" && url.pathname === "/v1/global-trust/output-validator/integrity";
      if (!evaluate && !list && !verify) return app.handleRequest(request);

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return response(401, {error:"unauthorized"});
      const tenantId = identity.principal?.tenantId;
      if (!tenantId) return response(403, {error:"tenant_context_unavailable"});

      const authorizationDecision = authorization.decide({
        identity,
        action: evaluate ? "global_trust.output_validator.evaluate" : "global_trust.output_validator.read",
        resource: `tenant:${tenantId}:global-trust-output-validator`,
        requiredScopes: evaluate ? ["outputvalidator:evaluate"] : ["audit:read"],
      });
      if (authorizationDecision.effect !== "allow") {
        return response(403, {error:"forbidden", authorizationDecision});
      }

      try {
        if (list) {
          const decisions = await outputValidator.listTenant({
            tenantId, limit: url.searchParams.get("limit") ?? 100,
          });
          return response(200, {
            tenantId, authorizationDecision, count: decisions.length, decisions,
            sensitiveContentIncluded: false,
          });
        }
        if (verify) {
          const verification = await integrity.verifyTenant({tenantId});
          return response(verification.valid ? 200 : 409, {
            tenantId, authorizationDecision, verification, sensitiveContentIncluded: false,
          });
        }
        if (header(request.headers, "x-operation-confirmation") !== CONFIRMATION) {
          return response(428, {
            error:"explicit_confirmation_required",
            requiredConfirmation: CONFIRMATION,
            authorizationDecision,
          });
        }

        const body = bodyOf(request.body);
        const decision = await outputValidator.evaluate({
          identity,
          output: body.output,
          sourceType: body.sourceType,
          useCaseId: body.useCaseId,
          dataPolicyId: body.dataPolicyId,
          modelId: body.modelId,
          correlationId: body.correlationId
            ?? header(request.headers, "x-correlation-id")
            ?? header(request.headers, "x-request-id"),
        });
        const status = decision.outcome === "allow" ? 200 : decision.outcome === "review" ? 202 : 403;
        return response(status, {
          tenantId, authorizationDecision, decision,
          outputPersisted:false, modelExecuted:false, toolExecuted:false,
          providerContacted:false, sensitiveContentIncluded:false,
        });
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof TypeError || error instanceof RangeError) {
          return response(400, {
            error: list ? "invalid_output_validator_query" : "invalid_output_validator_request",
            message: error.message,
            authorizationDecision,
          });
        }
        throw error;
      }
    },
  });
}
