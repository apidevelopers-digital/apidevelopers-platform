const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
});

class OperatorApiKeyProvisioningHttpError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "OperatorApiKeyProvisioningHttpError";
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(status, payload) {
  return { status, headers: JSON_HEADERS, body: JSON.stringify(payload) };
}

function parseJsonObjectBody(body) {
  if (body === undefined || String(body).trim() === "") return {};
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new OperatorApiKeyProvisioningHttpError(400, "invalid_json_body");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new OperatorApiKeyProvisioningHttpError(400, "json_object_body_required");
  }
  return parsed;
}

function requireScope(identity, scope) {
  const scopes = identity?.principal?.scopes;
  return Array.isArray(scopes) && scopes.includes(scope);
}

function publicIdentity(identity) {
  if (!identity || typeof identity !== "object") return null;
  const principal = identity.principal ?? {};
  return Object.freeze({
    role: identity.role,
    principal: Object.freeze({
      ...(principal.id !== undefined ? { id: principal.id } : {}),
      ...(principal.tenantId !== undefined ? { tenantId: principal.tenantId } : {}),
      ...(principal.name !== undefined ? { name: principal.name } : {}),
      ...(Array.isArray(principal.scopes) ? { scopes: [...principal.scopes] } : {}),
    }),
  });
}

function normalizeMethod(method) {
  return String(method ?? "GET").toUpperCase();
}

function normalizePath(url) {
  const requestUrl = new URL(String(url ?? "/"), "http://api-gateway.local");
  return requestUrl.pathname;
}

export function createOperatorApiKeyProvisioningHttpApp({
  authenticator,
  provisioner,
  requiredScope = "operator:resource:read",
} = {}) {
  if (!authenticator || typeof authenticator.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (!provisioner || typeof provisioner.planIssue !== "function" || typeof provisioner.issue !== "function") {
    throw new TypeError("provisioner.planIssue and provisioner.issue must be functions");
  }

  return Object.freeze({
    async handleRequest({ method = "GET", url = "/", headers = {}, body } = {}) {
      const normalizedMethod = normalizeMethod(method);
      const pathname = normalizePath(url);

      if (pathname !== "/v1/operator/api-keys/issue") return null;
      if (normalizedMethod !== "POST") {
        return jsonResponse(405, { ok: false, error: "method_not_allowed" });
      }

      const identity = await authenticator.authenticate(headers);
      if (!identity) return jsonResponse(401, { ok: false, error: "unauthorized" });
      if (!requireScope(identity, requiredScope)) {
        return jsonResponse(403, { ok: false, error: "insufficient_scope" });
      }

      let payload;
      try {
        payload = parseJsonObjectBody(body);
      } catch (error) {
        if (error instanceof OperatorApiKeyProvisioningHttpError) {
          return jsonResponse(error.status, { ok: false, error: error.code });
        }
        throw error;
      }

      const request = {
        tenantId: payload.tenantId,
        name: payload.name,
        scopes: payload.scopes,
        requestedBy: payload.requestedBy ?? identity.principal?.name ?? identity.principal?.id ?? "operator",
        reason: payload.reason,
      };

      try {
        if (payload.mode === "real") {
          const result = await provisioner.issue({
            ...request,
            confirmation: payload.confirmation,
          });

          return jsonResponse(201, {
            ok: true,
            mode: "real",
            identity: publicIdentity(identity),
            tenantId: result.tenantId,
            name: result.name,
            scopes: result.scopes,
            apiKeyId: result.apiKeyId,
            prefix: result.prefix,
            status: result.status,
            createdAt: result.createdAt,
            secret: result.secret,
            secretReturned: result.secretReturned,
            secretHandling: result.secretHandling,
          });
        }

        const plan = provisioner.planIssue(request);
        return jsonResponse(200, {
          ok: true,
          mode: "dry-run",
          identity: publicIdentity(identity),
          tenantId: plan.tenantId,
          name: plan.name,
          scopes: plan.scopes,
          secretReturned: plan.secretReturned,
          requiresApproval: plan.requiresApproval,
        });
      } catch (error) {
        return jsonResponse(400, {
          ok: false,
          error: error instanceof Error ? error.message : "operator_api_key_provisioning_failed",
        });
      }
    },
  });
}
