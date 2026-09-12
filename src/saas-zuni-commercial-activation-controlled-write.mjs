import { authorize } from "@apidevelopers/auth-core";
import {
  createZuniActivationPlan,
  executeZuniActivationPlan,
  ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION,
} from "@apidevelopers/saas-runtime";

export const ZUNI_COMMERCIAL_ACTIVATION_WRITE_SCOPE = "saas:zuni:activation:write";
export const ZUNI_COMMERCIAL_ACTIVATION_WRITE_APPROVAL =
  "IGOR_APROVA_ZUNI_COMMERCIAL_ACTIVATION_WRITE_V1";

const response = (status, payload) => Object.freeze({
  status,
  headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
  body: JSON.stringify(payload),
});

const clean = (value) => String(value ?? "").trim();

function bodyOf(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const text = clean(value);
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("body_invalid");
  }
  return parsed;
}

function hasWriteRuntime(runtime) {
  return [
    "registerTenantWorkspace",
    "startSubscription",
    "grantEntitlement",
    "enqueueProvisioning",
    "getTenant",
    "getWorkspace",
    "getSubscription",
    "getEntitlement",
    "getProvisioningJob",
  ].every((method) => typeof runtime?.[method] === "function");
}

export function createZuniCommercialActivationControlledWriteApp({
  authenticator,
  runtime,
  audit,
  writeEnabled = false,
} = {}) {
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (typeof audit !== "function") {
    throw new TypeError("audit must be a function");
  }

  return Object.freeze({
    async handleRequest({ method = "GET", url = "/", headers = {}, body = "" } = {}) {
      const pathname = new URL(String(url), "http://api-gateway.local").pathname;
      if (
        String(method).toUpperCase() !== "POST" ||
        pathname !== "/v1/saas/zuni/activation/write"
      ) {
        return null;
      }

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

      if (writeEnabled !== true || !hasWriteRuntime(runtime)) {
        return response(423, {
          ok: false,
          reason: "zuni_commercial_activation_write_disabled",
          writeEnabled: false,
          writesExecuted: false,
          chargeExecuted: false,
        });
      }

      try {
        const input = bodyOf(body);
        if (clean(input.approval) !== ZUNI_COMMERCIAL_ACTIVATION_WRITE_APPROVAL) {
          return response(403, {
            ok: false,
            reason: "zuni_commercial_activation_write_approval_required",
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
          runtime,
          activationPlan,
          audit,
          mode: "write",
          authorization: ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION,
          ...(clean(input.requestedAt) ? { requestedAt: clean(input.requestedAt) } : {}),
        });

        return response(201, {
          schemaVersion: 1,
          ok: true,
          productId: activationPlan.productId,
          planId: activationPlan.planId,
          executed: result.executed,
          writeAuthorized: result.writeAuthorized,
          result: result.result,
          execution: result.executionPlan,
          automaticCharge: false,
          chargeExecuted: false,
          secretsExposed: false,
        });
      } catch (error) {
        return response(400, {
          ok: false,
          reason: "invalid_zuni_commercial_activation_write",
          message: error instanceof Error ? error.message : "invalid_activation_write",
          writesExecuted: false,
          chargeExecuted: false,
          secretsExposed: false,
        });
      }
    },
  });
}
