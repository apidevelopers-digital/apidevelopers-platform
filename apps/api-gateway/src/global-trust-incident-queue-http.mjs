const CONFIRMATION = "IGOR_APROVA_EXECUCAO";
const CREATE_KEYS = new Set([
  "category",
  "severity",
  "sourceType",
  "correlationId",
  "evidenceRefs",
]);
const TRANSITION_KEYS = new Set(["status", "reasonCode"]);

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

function bodyOf(body, allowedKeys) {
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
  const unknown = Object.keys(parsed).filter((key) => !allowedKeys.has(key));
  if (unknown.length) {
    throw new TypeError(
      `request contains unsupported fields: ${unknown.sort().join(", ")}`,
    );
  }
  return parsed;
}

function incidentPath(pathname) {
  const history = pathname.match(
    /^\/v1\/global-trust\/incidents\/([^/]+)\/history$/,
  );
  if (history) {
    return { incidentId: decodeURIComponent(history[1]), operation: "history" };
  }

  const status = pathname.match(
    /^\/v1\/global-trust\/incidents\/([^/]+)\/status$/,
  );
  if (status) {
    return { incidentId: decodeURIComponent(status[1]), operation: "status" };
  }

  const detail = pathname.match(/^\/v1\/global-trust\/incidents\/([^/]+)$/);
  if (detail) {
    return { incidentId: decodeURIComponent(detail[1]), operation: "detail" };
  }
  return {};
}

export function createGlobalTrustIncidentQueueHttpApp({
  app,
  authenticator,
  authorization,
  incidentQueue,
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
  if (typeof incidentQueue?.create !== "function") {
    throw new TypeError("incidentQueue.create must be a function");
  }
  if (typeof integrity?.verifyTenant !== "function") {
    throw new TypeError("integrity.verifyTenant must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const url = new URL(request.url ?? "/", "http://gateway.local");
      const path = incidentPath(url.pathname);

      const isCreate =
        method === "POST" && url.pathname === "/v1/global-trust/incidents";
      const isList =
        method === "GET" && url.pathname === "/v1/global-trust/incidents";
      const isIntegrity =
        method === "GET"
        && url.pathname === "/v1/global-trust/incidents/integrity";
      const isDetail =
        method === "GET" && path.operation === "detail";
      const isHistory =
        method === "GET" && path.operation === "history";
      const isTransition =
        method === "POST" && path.operation === "status";

      if (
        !isCreate
        && !isList
        && !isIntegrity
        && !isDetail
        && !isHistory
        && !isTransition
      ) {
        return app.handleRequest(request);
      }

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return response(401, { error: "unauthorized" });

      const tenantId = identity.principal?.tenantId;
      if (!tenantId) {
        return response(403, { error: "tenant_context_unavailable" });
      }

      const write = isCreate || isTransition;
      const requiredScopes = isTransition
        ? ["incident:manage"]
        : isCreate
          ? ["incident:write"]
          : ["incident:read"];
      const authorizationDecision = authorization.decide({
        identity,
        action: isTransition
          ? "global_trust.incident.transition"
          : isCreate
            ? "global_trust.incident.create"
            : "global_trust.incident.read",
        resource: `tenant:${tenantId}:global-trust-incidents`,
        requiredScopes,
      });
      if (authorizationDecision.effect !== "allow") {
        return response(403, {
          error: "forbidden",
          authorizationDecision,
        });
      }

      if (write && header(
        request.headers,
        "x-operation-confirmation",
      ) !== CONFIRMATION) {
        return response(428, {
          error: "explicit_confirmation_required",
          requiredConfirmation: CONFIRMATION,
          authorizationDecision,
        });
      }

      try {
        if (isCreate) {
          const body = bodyOf(request.body, CREATE_KEYS);
          const incident = await incidentQueue.create({
            identity,
            category: body.category,
            severity: body.severity,
            sourceType: body.sourceType,
            correlationId:
              body.correlationId
              ?? header(request.headers, "x-correlation-id")
              ?? header(request.headers, "x-request-id"),
            evidenceRefs: body.evidenceRefs,
          });
          return response(201, {
            tenantId,
            authorizationDecision,
            incident,
            automaticRemediationExecuted: false,
            sensitiveContentIncluded: false,
          });
        }

        if (isList) {
          const incidents = await incidentQueue.listTenant({
            tenantId,
            status: url.searchParams.get("status") ?? undefined,
            severity: url.searchParams.get("severity") ?? undefined,
            limit: url.searchParams.get("limit") ?? 100,
          });
          return response(200, {
            tenantId,
            authorizationDecision,
            count: incidents.length,
            incidents,
            sensitiveContentIncluded: false,
          });
        }

        if (isIntegrity) {
          const verification = await integrity.verifyTenant({ tenantId });
          return response(verification.valid ? 200 : 409, {
            tenantId,
            authorizationDecision,
            verification,
            sensitiveContentIncluded: false,
          });
        }

        if (isDetail) {
          const incident = await incidentQueue.get({
            tenantId,
            incidentId: path.incidentId,
          });
          return response(200, {
            tenantId,
            authorizationDecision,
            incident,
            sensitiveContentIncluded: false,
          });
        }

        if (isHistory) {
          const events = await incidentQueue.history({
            tenantId,
            incidentId: path.incidentId,
          });
          return response(200, {
            tenantId,
            authorizationDecision,
            count: events.length,
            events,
            sensitiveContentIncluded: false,
          });
        }

        const body = bodyOf(request.body, TRANSITION_KEYS);
        const incident = await incidentQueue.transition({
          tenantId,
          incidentId: path.incidentId,
          identity,
          status: body.status,
          reasonCode: body.reasonCode,
        });
        return response(200, {
          tenantId,
          authorizationDecision,
          incident,
          automaticRemediationExecuted: false,
          sensitiveContentIncluded: false,
        });
      } catch (error) {
        if (error?.name === "IncidentQueueError") {
          return response(error.status ?? 409, {
            error: error.code ?? "incident_queue_error",
            message: error.message,
            authorizationDecision,
          });
        }
        if (
          error instanceof SyntaxError
          || error instanceof TypeError
          || error instanceof RangeError
        ) {
          return response(400, {
            error: "invalid_incident_request",
            message: error.message,
            authorizationDecision,
          });
        }
        throw error;
      }
    },
  });
}
