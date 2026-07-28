const CONFIRMATION = "IGOR_APROVA_EXECUCAO";
const RUN_KEYS = new Set([
  "modelId",
  "useCaseId",
  "dataPolicyId",
  "locale",
  "region",
  "dataClasses",
  "sensitiveData",
  "prompt",
  "syntheticOutput",
  "toolProposals",
  "correlationId",
]);

function response(status, payload) {
  return {
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
    }),
    body: JSON.stringify(payload),
  };
}

function header(headers, name) {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === expected) {
      return String(value ?? "").trim() || undefined;
    }
  }
  return undefined;
}

function bodyOf(body) {
  if (body === undefined || body === null || body === "") {
    throw new TypeError("request body is required");
  }
  const parsed =
    typeof body === "object" && !Buffer.isBuffer(body) && !Array.isArray(body)
      ? body
      : JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : String(body));

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("request body must be a JSON object");
  }
  const unknown = Object.keys(parsed).filter((key) => !RUN_KEYS.has(key));
  if (unknown.length) {
    throw new TypeError(
      `request contains unsupported fields: ${unknown.sort().join(", ")}`,
    );
  }
  return parsed;
}

export function createGlobalTrustSafetySimulationHttpApp({
  app,
  authenticator,
  authorization,
  simulation,
  integrity,
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
  if (typeof simulation?.run !== "function") {
    throw new TypeError("simulation.run must be a function");
  }
  if (typeof integrity?.verifyTenant !== "function") {
    throw new TypeError("integrity.verifyTenant must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const url = new URL(request.url ?? "/", "http://gateway.local");
      const isRun =
        method === "POST"
        && url.pathname === "/v1/global-trust/simulations/run";
      const isList =
        method === "GET"
        && url.pathname === "/v1/global-trust/simulations";
      const isIntegrity =
        method === "GET"
        && url.pathname === "/v1/global-trust/simulations/integrity";

      if (!isRun && !isList && !isIntegrity) {
        return app.handleRequest(request);
      }

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return response(401, { error: "unauthorized" });
      const tenantId = identity.principal?.tenantId;
      if (!tenantId) {
        return response(403, { error: "tenant_context_unavailable" });
      }

      const requiredScopes = isRun ? ["simulation:run"] : ["audit:read"];
      const authorizationDecision = authorization.decide({
        identity,
        action: isRun
          ? "global_trust.simulation.run"
          : "global_trust.simulation.read",
        resource: `tenant:${tenantId}:global-trust-simulation`,
        requiredScopes,
      });
      if (authorizationDecision.effect !== "allow") {
        return response(403, {
          error: "forbidden",
          authorizationDecision,
        });
      }

      if (
        isRun
        && header(request.headers, "x-operation-confirmation") !== CONFIRMATION
      ) {
        return response(428, {
          error: "explicit_confirmation_required",
          requiredConfirmation: CONFIRMATION,
          authorizationDecision,
        });
      }

      try {
        if (isRun) {
          const body = bodyOf(request.body);
          const result = await simulation.run({
            identity,
            ...body,
            correlationId:
              body.correlationId
              ?? header(request.headers, "x-correlation-id")
              ?? header(request.headers, "x-request-id"),
          });
          return response(201, {
            tenantId,
            authorizationDecision,
            simulation: result,
            inferenceExecuted: false,
            modelExecuted: false,
            toolExecuted: false,
            providerContacted: false,
          });
        }

        if (isList) {
          const simulations = await simulation.listTenant({
            tenantId,
            limit: url.searchParams.get("limit") ?? 100,
          });
          return response(200, {
            tenantId,
            authorizationDecision,
            count: simulations.length,
            simulations,
          });
        }

        const verification = await integrity.verifyTenant({ tenantId });
        return response(verification.valid ? 200 : 409, {
          tenantId,
          authorizationDecision,
          verification,
        });
      } catch (error) {
        if (
          error instanceof SyntaxError
          || error instanceof TypeError
          || error instanceof RangeError
        ) {
          return response(400, {
            error: "invalid_safety_simulation_request",
            message: error.message,
            authorizationDecision,
          });
        }
        throw error;
      }
    },
  });
}
