import { authorize } from "@apidevelopers/auth-core";
import { createSaasProvisioningApp } from "./saas-provisioning.mjs";

export const ZUNI_PREVIEW_PROVISION_SCOPE = "saas:provision:zuni-preview";
const DELEGATED_ACCESS_SCOPE = "saas:access:delegate";
const DELEGATED_BACKEND_PRINCIPAL_ID = "backend-delegated";

const HEX64 = /^[a-f0-9]{64}$/;
const IDEMPOTENCY = /^[A-Za-z0-9_.:-]{8,200}$/;

const response = (status, payload) => Object.freeze({
  status,
  headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
  body: JSON.stringify(payload),
});

function header(headers, name) {
  const target = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (String(key).toLowerCase() === target) return String(value ?? "").trim();
  }
  return "";
}

function bodyOf(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const text = String(value ?? "").trim();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("body_invalid");
  }
  return parsed;
}

function isTrustedDelegatedBackend(actor) {
  const scopes = Array.isArray(actor?.principal?.scopes) ? actor.principal.scopes : [];
  return (
    actor?.role === "service" &&
    actor?.principal?.id === DELEGATED_BACKEND_PRINCIPAL_ID &&
    actor?.principal?.status === "active" &&
    scopes.includes(DELEGATED_ACCESS_SCOPE)
  );
}

export function createZuniPreviewProvisioningApp({
  authenticator,
  saasRuntime,
  saasAccess,
  federatedPrincipal,
  clock,
} = {}) {
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }

  const internalProvisioningApp = createSaasProvisioningApp({
    authenticator: {
      authenticate: async () => Object.freeze({
        role: "service",
        principal: Object.freeze({
          id: "component.principal.zuni-preview-bootstrap",
          status: "active",
          scopes: Object.freeze(["saas:provision"]),
        }),
      }),
    },
    saasRuntime,
    saasAccess,
    federatedPrincipal,
    ...(clock ? { clock } : {}),
  });

  return Object.freeze({
    async handleRequest({
      method = "GET",
      url = "/",
      headers = {},
      body = "",
    } = {}) {
      const pathname = new URL(String(url), "http://api-gateway.local").pathname;
      if (
        String(method).toUpperCase() !== "POST" ||
        pathname !== "/v1/saas/zuni-preview/provision"
      ) {
        return null;
      }

      const actor = await authenticator.authenticate(headers);
      if (!actor) return response(401, { ok: false, reason: "unauthorized" });

      const narrowDecision = authorize(actor, { scopes: [ZUNI_PREVIEW_PROVISION_SCOPE] });
      if (!narrowDecision.allowed && !isTrustedDelegatedBackend(actor)) {
        return response(403, {
          ok: false,
          reason: "zuni_preview_provision_scope_forbidden",
          missingScopes: narrowDecision.missingScopes,
        });
      }

      try {
        const subjectRef = header(headers, "x-delegated-subject-ref").toLowerCase();
        if (!HEX64.test(subjectRef)) {
          return response(400, { ok: false, reason: "subject_ref_invalid" });
        }

        const input = bodyOf(body);
        const idempotencyKey = String(input.idempotencyKey ?? "").trim();
        if (!IDEMPOTENCY.test(idempotencyKey)) {
          return response(400, { ok: false, reason: "idempotency_key_invalid" });
        }

        const delegated = await internalProvisioningApp.handleRequest({
          method: "POST",
          url: "/v1/saas/provision",
          headers: {},
          body: {
            tenantSlug: "zuni-preview",
            workspaceSlug: "preview-main",
            displayName: "Zuni Preview",
            workspaceDisplayName: "Zuni Preview Main",
            planId: "pro",
            currency: "BRL",
            monthlyAmount: 59700,
            subjectRef,
            idempotencyKey,
          },
        });

        if (!delegated) {
          return response(500, { ok: false, reason: "internal_provisioning_unavailable" });
        }
        return delegated;
      } catch {
        return response(400, { ok: false, reason: "invalid_zuni_preview_provision_request" });
      }
    },
  });
}
