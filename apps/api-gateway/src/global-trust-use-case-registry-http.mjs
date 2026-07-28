const EXECUTION_CONFIRMATION = "IGOR_APROVA_EXECUCAO";
const REGISTER_KEYS = new Set([
  "useCaseId",
  "ownerId",
  "purpose",
  "dataPolicyId",
  "riskLevel",
  "allowedModelIds",
  "allowedToolIds",
  "allowedLocales",
  "humanApprovalRequired",
  "reasonCode",
  "correlationId",
]);
const TRANSITION_KEYS = new Set([
  "status",
  "reasonCode",
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
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("request body must be a JSON object");
  }
  return parsed;
}

function rejectUnknownKeys(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new TypeError(
      `request contains unsupported fields: ${unknown.sort().join(", ")}`,
    );
  }
}

function correlationId(request, body) {
  return body.correlationId
    ?? readHeader(request.headers, "x-correlation-id")
    ?? readHeader(request.headers, "x-request-id");
}

function route(pathname) {
  if (pathname === "/v1/global-trust/use-cases") {
    return { kind: "collection" };
  }
  if (pathname === "/v1/global-trust/use-cases/integrity") {
    return { kind: "integrity" };
  }
  const match = pathname.match(
    /^\/v1\/global-trust\/use-cases\/([^/]+)(?:\/(history|status))?$/,
  );
  if (!match) return null;
  return {
    kind: match[2] ?? "item",
    useCaseId: decodeURIComponent(match[1]),
  };
}

export function createGlobalTrustUseCaseRegistryHttpApp({
  app,
  authenticator,
  authorization,
  registry,
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
  if (typeof registry?.register !== "function") {
    throw new TypeError("registry.register must be a function");
  }
  if (typeof integrity?.verifyTenant !== "function") {
    throw new TypeError("integrity.verifyTenant must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsedUrl = new URL(
        request.url ?? "/",
        "http://gateway.local",
      );
      const matched = route(parsedUrl.pathname);
      if (!matched) return app.handleRequest(request);

      const allowed =
        (matched.kind === "collection" && ["GET", "POST"].includes(method))
        || (matched.kind === "item" && method === "GET")
        || (matched.kind === "history" && method === "GET")
        || (matched.kind === "status" && method === "POST")
        || (matched.kind === "integrity" && method === "GET");
      if (!allowed) return app.handleRequest(request);

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return jsonResponse(401, { error: "unauthorized" });
      const tenantId = identity.principal?.tenantId;
      if (!tenantId) {
        return jsonResponse(403, { error: "tenant_context_unavailable" });
      }

      const writeOperation = method === "POST";
      const requiredScopes = writeOperation
        ? ["usecase:read", "usecase:write"]
        : ["usecase:read"];
      const action = writeOperation
        ? "global_trust.use_case_registry.write"
        : "global_trust.use_case_registry.read";
      const authorizationDecision = authorization.decide({
        identity,
        action,
        resource: `tenant:${tenantId}:global-trust-use-case-registry`,
        requiredScopes,
      });
      if (authorizationDecision.effect !== "allow") {
        return jsonResponse(403, {
          error: "forbidden",
          authorizationDecision,
        });
      }

      if (writeOperation) {
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
      }

      try {
        if (matched.kind === "collection" && method === "GET") {
          const useCases = await registry.list({
            tenantId,
            status: parsedUrl.searchParams.get("status") ?? undefined,
            limit: parsedUrl.searchParams.get("limit") ?? 100,
          });
          return jsonResponse(200, {
            tenantId,
            authorizationDecision,
            count: useCases.length,
            useCases,
            sensitiveContentIncluded: false,
          });
        }

        if (matched.kind === "collection" && method === "POST") {
          const body = parseJsonBody(request.body);
          rejectUnknownKeys(body, REGISTER_KEYS);
          const event = await registry.register({
            identity,
            useCaseId: body.useCaseId,
            ownerId: body.ownerId,
            purpose: body.purpose,
            dataPolicyId: body.dataPolicyId,
            riskLevel: body.riskLevel,
            allowedModelIds: body.allowedModelIds,
            allowedToolIds: body.allowedToolIds,
            allowedLocales: body.allowedLocales,
            humanApprovalRequired: body.humanApprovalRequired,
            reasonCode: body.reasonCode,
            correlationId: correlationId(request, body),
          });
          return jsonResponse(201, {
            tenantId,
            authorizationDecision,
            event,
            executedUseCase: false,
            modelExecuted: false,
            providerContacted: false,
            sensitiveContentIncluded: false,
          });
        }

        if (matched.kind === "item") {
          const useCase = await registry.get({
            tenantId,
            useCaseId: matched.useCaseId,
          });
          if (!useCase) {
            return jsonResponse(404, { error: "use_case_not_found" });
          }
          return jsonResponse(200, {
            tenantId,
            authorizationDecision,
            useCase,
            sensitiveContentIncluded: false,
          });
        }

        if (matched.kind === "history") {
          const events = await registry.history({
            tenantId,
            useCaseId: matched.useCaseId,
          });
          if (!events.length) {
            return jsonResponse(404, { error: "use_case_not_found" });
          }
          return jsonResponse(200, {
            tenantId,
            authorizationDecision,
            count: events.length,
            events,
            sensitiveContentIncluded: false,
          });
        }

        if (matched.kind === "status") {
          const body = parseJsonBody(request.body);
          rejectUnknownKeys(body, TRANSITION_KEYS);
          const result = await registry.transition({
            identity,
            useCaseId: matched.useCaseId,
            status: body.status,
            reasonCode: body.reasonCode,
            correlationId: correlationId(request, body),
          });
          return jsonResponse(200, {
            tenantId,
            authorizationDecision,
            result,
            executedUseCase: false,
            modelExecuted: false,
            providerContacted: false,
            sensitiveContentIncluded: false,
          });
        }

        if (matched.kind === "integrity") {
          const verification = await integrity.verifyTenant({ tenantId });
          return jsonResponse(verification.valid ? 200 : 409, {
            tenantId,
            authorizationDecision,
            verification,
            sensitiveContentIncluded: false,
          });
        }
      } catch (error) {
        if (error?.name === "UseCaseRegistryError") {
          return jsonResponse(error.status ?? 409, {
            error: error.code ?? "use_case_registry_error",
            message: error.message,
            authorizationDecision,
          });
        }
        if (
          error instanceof SyntaxError
          || error instanceof TypeError
          || error instanceof RangeError
          || error?.name === "Error"
        ) {
          return jsonResponse(400, {
            error: "invalid_use_case_registry_request",
            message: error.message,
            authorizationDecision,
          });
        }
        throw error;
      }

      return app.handleRequest(request);
    },
  });
}
