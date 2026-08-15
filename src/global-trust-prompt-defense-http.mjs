const EXECUTION_CONFIRMATION = "IGOR_APROVA_EXECUCAO";
const EVALUATE_KEYS = new Set([
  "prompt",
  "sourceType",
  "useCaseId",
  "dataPolicyId",
  "correlationId",
]);

function jsonResponse(status, payload) {
  return {
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
    }),
    body: JSON.stringify(payload),
  };
}

function readHeader(headers, name) {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === expected) {
      return String(value ?? "").trim() || undefined;
    }
  }
  return undefined;
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
  const parsed = JSON.parse(
    Buffer.isBuffer(body) ? body.toString("utf8") : String(body),
  );
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("request body must be a JSON object");
  }
  return parsed;
}

function rejectUnknownKeys(body) {
  const unknown = Object.keys(body).filter((key) => !EVALUATE_KEYS.has(key));
  if (unknown.length) {
    throw new TypeError(
      `request contains unsupported fields: ${unknown.sort().join(", ")}`,
    );
  }
}

export function createGlobalTrustPromptDefenseHttpApp({
  app,
  authenticator,
  authorization,
  promptDefense,
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
  if (typeof promptDefense?.evaluate !== "function") {
    throw new TypeError("promptDefense.evaluate must be a function");
  }
  if (typeof promptDefense?.listTenant !== "function") {
    throw new TypeError("promptDefense.listTenant must be a function");
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
        && parsedUrl.pathname === "/v1/global-trust/prompt-defense/evaluate";
      const isList =
        method === "GET"
        && parsedUrl.pathname === "/v1/global-trust/prompt-defense/decisions";

      if (!isEvaluate && !isList) return app.handleRequest(request);

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return jsonResponse(401, { error: "unauthorized" });

      const tenantId = identity.principal?.tenantId;
      if (!tenantId) {
        return jsonResponse(403, { error: "tenant_context_unavailable" });
      }

      const authorizationDecision = authorization.decide({
        identity,
        action: isEvaluate
          ? "global_trust.prompt_defense.evaluate"
          : "global_trust.prompt_defense.read",
        resource: `tenant:${tenantId}:global-trust-prompt-defense`,
        requiredScopes: isEvaluate
          ? ["promptdefense:evaluate"]
          : ["audit:read"],
      });
      if (authorizationDecision.effect !== "allow") {
        return jsonResponse(403, {
          error: "forbidden",
          authorizationDecision,
        });
      }

      if (isList) {
        try {
          const decisions = await promptDefense.listTenant({
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
              error: "invalid_prompt_defense_query",
              message: error.message,
              authorizationDecision,
            });
          }
          throw error;
        }
      }

      const confirmation = readHeader(
        request.headers,
        "x-operation-confirmation",
      );
      if (confirmation !== EXECUTION_CONFIRMATION) {
        return jsonResponse(428, {
          error: "explicit_confirmation_required",
          requiredConfirmation: EXECUTION_CONFIRMATION,
          authorizationDecision,
        });
      }

      try {
        const body = parseJsonBody(request.body);
        rejectUnknownKeys(body);
        const decision = await promptDefense.evaluate({
          identity,
          prompt: body.prompt,
          sourceType: body.sourceType,
          useCaseId: body.useCaseId,
          dataPolicyId: body.dataPolicyId,
          correlationId:
            body.correlationId
            ?? readHeader(request.headers, "x-correlation-id")
            ?? readHeader(request.headers, "x-request-id"),
        });
        const status =
          decision.outcome === "allow"
            ? 200
            : decision.outcome === "review"
              ? 202
              : 403;
        return jsonResponse(status, {
          tenantId,
          authorizationDecision,
          decision,
          promptPersisted: false,
          modelExecuted: false,
          toolExecuted: false,
          providerContacted: false,
          sensitiveContentIncluded: false,
        });
      } catch (error) {
        if (
          error instanceof SyntaxError
          || error instanceof TypeError
          || error instanceof RangeError
        ) {
          return jsonResponse(400, {
            error: "invalid_prompt_defense_request",
            message: error.message,
            authorizationDecision,
          });
        }
        throw error;
      }
    },
  });
}
