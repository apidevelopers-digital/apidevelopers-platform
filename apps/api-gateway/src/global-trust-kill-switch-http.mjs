const EXECUTION_CONFIRMATION = "IGOR_APROVA_EXECUCAO";

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
    if (key.toLowerCase() === expected) {
      return String(value ?? "").trim() || undefined;
    }
  }
  return undefined;
}

function parseEnabled(value) {
  if (value === "true" || value === "enabled") return true;
  if (value === "false" || value === "disabled") return false;
  throw new TypeError("x-kill-switch-enabled must be true, false, enabled, or disabled");
}

export function createGlobalTrustKillSwitchHttpApp({
  app,
  authenticator,
  authorization,
  killSwitch,
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
  if (typeof killSwitch?.getTenant !== "function") {
    throw new TypeError("killSwitch.getTenant must be a function");
  }
  if (typeof killSwitch?.setTenant !== "function") {
    throw new TypeError("killSwitch.setTenant must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsed = new URL(request.url ?? "/", "http://gateway.local");
      if (
        parsed.pathname !== "/v1/global-trust/kill-switch"
        || !["GET", "POST"].includes(method)
      ) {
        return app.handleRequest(request);
      }

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return jsonResponse(401, { error: "unauthorized" });

      const tenantId = identity.principal?.tenantId;
      if (!tenantId) {
        return jsonResponse(403, { error: "tenant_context_unavailable" });
      }

      const requiredScopes = method === "POST"
        ? ["audit:read", "audit:write"]
        : ["audit:read"];
      const authorizationDecision = authorization.decide({
        identity,
        action: method === "POST"
          ? "global_trust.kill_switch.write"
          : "global_trust.kill_switch.read",
        resource: `tenant:${tenantId}:global-trust-kill-switch`,
        requiredScopes,
      });
      if (authorizationDecision.effect !== "allow") {
        return jsonResponse(403, {
          error: "forbidden",
          authorizationDecision,
        });
      }

      if (method === "GET") {
        const state = await killSwitch.getTenant({ tenantId });
        return jsonResponse(200, {
          tenantId,
          authorizationDecision,
          state,
        });
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
        const enabled = parseEnabled(
          readHeader(request.headers, "x-kill-switch-enabled"),
        );
        const reasonCode = readHeader(request.headers, "x-kill-switch-reason");
        const correlationId = readHeader(request.headers, "x-correlation-id")
          ?? readHeader(request.headers, "x-request-id");

        const state = await killSwitch.setTenant({
          tenantId,
          identity,
          enabled,
          reasonCode,
          correlationId,
        });
        return jsonResponse(200, {
          tenantId,
          authorizationDecision,
          state,
        });
      } catch (error) {
        if (error?.name === "KillSwitchError") {
          return jsonResponse(error.status ?? 409, {
            error: error.code ?? "kill_switch_error",
            message: error.message,
            authorizationDecision,
          });
        }
        if (error instanceof TypeError || error instanceof RangeError) {
          return jsonResponse(400, {
            error: "invalid_kill_switch_request",
            message: error.message,
            authorizationDecision,
          });
        }
        throw error;
      }
    },
  });
}
