import { authorize } from "@apidevelopers/auth-core";

const DELEGATE_SCOPE = "saas:access:delegate";
const SUBJECT_REF_PATTERN = /^[a-f0-9]{64}$/;

function jsonResponse(status, payload) {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
    }),
    body: JSON.stringify(payload),
  });
}

function normalizeHeader(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return String(value ?? "").trim();
}

function parseScopes(headers) {
  const raw = normalizeHeader(headers, "x-delegated-scopes");
  if (!raw) return [];
  return [...new Set(raw.split(",").map((scope) => scope.trim()).filter(Boolean))];
}

export function createDelegatedSaasAccessApp({
  authenticator,
  saasAccess,
  federatedPrincipal,
  provider = "unico-operator-session",
} = {}) {
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (
    typeof saasAccess?.evaluateAccess !== "function" ||
    typeof saasAccess?.resolveActiveGrant !== "function"
  ) {
    throw new TypeError("saasAccess.evaluateAccess and resolveActiveGrant must be functions");
  }
  if (typeof federatedPrincipal?.resolveFederatedPrincipal !== "function") {
    throw new TypeError("federatedPrincipal.resolveFederatedPrincipal must be a function");
  }

  return Object.freeze({
    async handleRequest({ method = "GET", url = "/", headers = {} } = {}) {
      const normalizedMethod = String(method).toUpperCase();
      const requestUrl = new URL(String(url), "http://api-gateway.local");

      if (
        normalizedMethod !== "GET" ||
        requestUrl.pathname !== "/v1/saas/access/delegated"
      ) {
        return null;
      }

      const actor = await authenticator.authenticate(headers);
      if (!actor) {
        return jsonResponse(401, { allowed: false, reason: "unauthorized" });
      }

      const delegation = authorize(actor, { scopes: [DELEGATE_SCOPE] });
      if (!delegation.allowed) {
        return jsonResponse(403, {
          allowed: false,
          reason: "delegation_scope_forbidden",
          missingScopes: delegation.missingScopes,
        });
      }

      const tenantId = actor?.principal?.tenantId;
      if (!tenantId) {
        return jsonResponse(403, {
          allowed: false,
          reason: "tenant_context_unavailable",
        });
      }

      const subjectRef = normalizeHeader(headers, "x-delegated-subject-ref").toLowerCase();
      if (!SUBJECT_REF_PATTERN.test(subjectRef)) {
        return jsonResponse(400, {
          allowed: false,
          reason: "delegated_subject_ref_required",
        });
      }

      const productId = requestUrl.searchParams.get("productId")?.trim();
      if (!productId) {
        return jsonResponse(400, {
          allowed: false,
          reason: "product_context_required",
        });
      }

      const principal = await federatedPrincipal.resolveFederatedPrincipal({
        tenantId,
        provider,
        externalSubject: subjectRef,
        subjectType: "delegated_subject_ref",
      });

      const binding = await saasAccess.resolveActiveGrant({
        tenantId,
        principalId: principal.principalId,
        productId,
      });
      if (!binding.resolved) {
        return jsonResponse(403, {
          allowed: false,
          reason: binding.reason,
          principalId: principal.principalId,
        });
      }

      const subjectIdentity = Object.freeze({
        role: "delegated-subject",
        principal: Object.freeze({
          id: principal.principalId,
          tenantId,
          status: principal.status,
          scopes: Object.freeze(parseScopes(headers)),
        }),
      });

      const grant = binding.grant;
      const decision = await saasAccess.evaluateAccess({
        identity: subjectIdentity,
        accessGrantId: grant.accessGrantId,
        tenantId,
        workspaceId: grant.workspaceId,
        productId: grant.productId,
      });

      return jsonResponse(decision.allowed ? 200 : 403, {
        ...decision,
        principalId: principal.principalId,
      });
    },
  });
}
