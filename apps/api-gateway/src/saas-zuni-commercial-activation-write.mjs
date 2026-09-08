import { authorize } from "@apidevelopers/auth-core";
import {
  createZuniActivationPlan,
  executeZuniActivationPlan,
  ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION,
} from "@apidevelopers/saas-runtime";

export const ZUNI_COMMERCIAL_ACTIVATION_WRITE_SCOPE = "saas:zuni:activation:write";

const response = (status, payload) => Object.freeze({
  status,
  headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
  body: JSON.stringify(payload),
});

function clean(value) {
  return String(value ?? "").trim();
}

function bodyOf(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const text = clean(value);
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("body_invalid");
  return parsed;
}

export function createZuniCommercialActivationWriteApp({ authenticator, saasRuntime, audit = async () => {} } = {}) {
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (!saasRuntime || typeof saasRuntime !== "object") {
    throw new TypeError("saasRuntime is required");
  }
  if (typeof audit !== "function") throw new TypeError("audit must be a function");

  return Object.freeze({
    async handleRequest({ method = "GET", url = "/", headers = {}, body = "" } = {}) {
      const pathname = new URL(String(url), "http://api-gateway.local").pathname;
      if (String(method).toUpperCase() !== "POST" || pathname !== "/v1/saas/zuni/activation/write") return null;

      const actor = await authenticator.authenticate(headers);
      if (!actor) return response(401, { ok: false, reason: "unauthorized" });

      const decision = authorize(actor, { scopes: [ZUNI_COMMERCIAL_ACTIVATION_WRITE_SCOPE] });
      if (!decision.allowed) {
        return response(403, {
          ok: false,
          reason: "zuni_commercial_activation_write_scope_forbidden",
          missingScopes: decision.missingScopes,
        });
      }

      try {
        const input = bodyOf(body);
        if (clean(input.writeAuthorization) !== ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION) {
          return response(403, {
            ok: false,
            reason: "zuni_commercial_activation_write_authorization_required",
            writesExecuted: false,
            chargeExecuted: false,
          });
        }

        const activationPlan = createZuniActivationPlan({
          plan: input.plan,
          tenantSlug: input.tenantSlug,
          tenantDisplayName: input.tenantDisplayName,
          organizationId: input.organizationId,
          workspaceSlug: clean(input.workspaceSlug) || "principal",
          workspaceDisplayName: clean(input.workspaceDisplayName) || "Principal",
          ...(clean(input.createdAt) ? { createdAt: clean(input.createdAt) } : {}),
        });

        const result = await executeZuniActivationPlan({
          runtime: saasRuntime,
          activationPlan,
          audit,
          mode: "write",
          authorization: ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION,
          ...(clean(input.requestedAt) ? { requestedAt: clean(input.requestedAt) } : {}),
        });

        return response(201, {
          ok: true,
          productId: activationPlan.productId,
          planId: activationPlan.planId,
          automaticCharge: false,
          chargeExecuted: false,
          executed: result.executed,
          writeAuthorized: result.writeAuthorized,
          result: result.result,
          secretsExposed: false,
        });
      } catch (error) {
        return response(409, {
          ok: false,
          reason: "zuni_commercial_activation_write_failed",
          message: error instanceof Error ? error.message : "activation_write_failed",
          chargeExecuted: false,
          secretsExposed: false,
        });
      }
    },
  });
}
