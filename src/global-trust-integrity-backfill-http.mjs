import {
  GLOBAL_TRUST_INTEGRITY_BACKFILL_CONFIRMATION,
} from "./global-trust-integrity-backfill-confirmation.mjs";

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

export function createGlobalTrustIntegrityBackfillHttpApp({
  app,
  authenticator,
  authorization,
  backfill,
} = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest must be a function");
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (typeof authorization?.decide !== "function") {
    throw new TypeError("authorization.decide must be a function");
  }
  if (typeof backfill?.planTenant !== "function") {
    throw new TypeError("backfill.planTenant must be a function");
  }
  if (typeof backfill?.applyTenant !== "function") {
    throw new TypeError("backfill.applyTenant must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsed = new URL(request.url ?? "/", "http://gateway.local");
      if (parsed.pathname !== "/v1/global-trust/integrity/backfill") {
        return app.handleRequest(request);
      }
      if (method !== "GET" && method !== "POST") {
        return jsonResponse(405, { error: "method_not_allowed" });
      }

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return jsonResponse(401, { error: "unauthorized" });

      const tenantId = identity.principal?.tenantId;
      if (!tenantId) return jsonResponse(403, { error: "tenant_context_unavailable" });

      const requiredScopes = method === "POST"
        ? ["audit:read", "audit:write"]
        : ["audit:read"];
      const authorizationDecision = authorization.decide({
        identity,
        action: method === "POST"
          ? "global_trust.integrity.backfill.apply"
          : "global_trust.integrity.backfill.read",
        resource: `tenant:${tenantId}:global-trust-integrity-backfill`,
        requiredScopes,
      });
      if (authorizationDecision.effect !== "allow") {
        return jsonResponse(403, {
          error: "forbidden",
          authorizationDecision,
        });
      }

      if (method === "GET") {
        const plan = await backfill.planTenant({ tenantId });
        return jsonResponse(200, {
          tenantId,
          authorizationDecision,
          mode: "dry_run",
          plan,
        });
      }

      const confirmation = readHeader(request.headers, "x-operation-confirmation");
      if (confirmation !== GLOBAL_TRUST_INTEGRITY_BACKFILL_CONFIRMATION) {
        return jsonResponse(428, {
          error: "explicit_confirmation_required",
          requiredConfirmation: GLOBAL_TRUST_INTEGRITY_BACKFILL_CONFIRMATION,
          authorizationDecision,
        });
      }

      try {
        const execution = await backfill.applyTenant({ tenantId, confirmation });
        return jsonResponse(200, {
          tenantId,
          authorizationDecision,
          mode: "executed",
          execution,
        });
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) {
          return jsonResponse(409, {
            error: "integrity_backfill_blocked",
            message: error.message,
            authorizationDecision,
          });
        }
        throw error;
      }
    },
  });
}
