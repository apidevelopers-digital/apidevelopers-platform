const CONFIRMATION = "IGOR_APROVA_EXECUCAO";
const EVALUATE_KEYS = new Set([
  "modelId",
  "useCaseId",
  "dataPolicyId",
  "locale",
  "toolIds",
  "dataClasses",
  "region",
  "sensitiveData",
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
  const unknown = Object.keys(parsed).filter((key) => !EVALUATE_KEYS.has(key));
  if (unknown.length) {
    throw new TypeError(
      `request contains unsupported fields: ${unknown.sort().join(", ")}`,
    );
  }
  return parsed;
}

export function createGlobalTrustAdmissionGateHttpApp({
  app,
  authenticator,
  authorization,
  admissionGate,
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
  if (typeof admissionGate?.evaluate !== "function") {
    throw new TypeError("admissionGate.evaluate must be a function");
  }
  if (typeof integrity?.verifyTenant !== "function") {
    throw new TypeError("integrity.verifyTenant must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const url = new URL(request.url ?? "/", "http://gateway.local");
      const isEvaluate =
        method === "POST"
        && url.pathname === "/v1/global-trust/admission/evaluate";
      const isList =
        method === "GET"
        && url.pathname === "/v1/global-trust/admission/decisions";
      const isIntegrity =
        method === "GET"
        && url.pathname === "/v1/global-trust/admission/integrity";

      if (!isEvaluate && !isList && !isIntegrity) {
        return app.handleRequest(request);
      }

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return response(401, { error: "unauthorized" });
      const tenantId = identity.principal?.tenantId;
      if (!tenantId) {
        return response(403, { error: "tenant_context_unavailable" });
      }

      const requiredScopes = isEvaluate
        ? ["admission:evaluate"]
        : ["audit:read"];
      const authorizationDecision = authorization.decide({
        identity,
        action: isEvaluate
          ? "global_trust.admission.evaluate"
          : "global_trust.admission.read",
        resource: `tenant:${tenantId}:global-trust-admission`,
        requiredScopes,
      });
      if (authorizationDecision.effect !== "allow") {
        return response(403, {
          error: "forbidden",
          authorizationDecision,
        });
      }

      if (
        isEvaluate
        && header(request.headers, "x-operation-confirmation") !== CONFIRMATION
      ) {
        return response(428, {
          error: "explicit_confirmation_required",
          requiredConfirmation: CONFIRMATION,
          authorizationDecision,
        });
      }

      try {
        if (isEvaluate) {
          const body = bodyOf(request.body);
          const decision = await admissionGate.evaluate({
            identity,
            modelId: body.modelId,
            useCaseId: body.useCaseId,
            dataPolicyId: body.dataPolicyId,
            locale: body.locale,
            toolIds: body.toolIds,
            dataClasses: body.dataClasses,
            region: body.region,
            sensitiveData: body.sensitiveData,
            correlationId:
              body.correlationId
              ?? header(request.headers, "x-correlation-id")
              ?? header(request.headers, "x-request-id"),
          });
          return response(201, {
            tenantId,
            authorizationDecision,
            decision,
            inferenceExecuted: false,
            modelExecuted: false,
            toolExecuted: false,
            providerContacted: false,
          });
        }

        if (isList) {
          const decisions = await admissionGate.listTenant({
            tenantId,
            limit: url.searchParams.get("limit") ?? 100,
          });
          return response(200, {
            tenantId,
            authorizationDecision,
            count: decisions.length,
            decisions,
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
            error: "invalid_admission_request",
            message: error.message,
            authorizationDecision,
          });
        }
        throw error;
      }
    },
  });
}
