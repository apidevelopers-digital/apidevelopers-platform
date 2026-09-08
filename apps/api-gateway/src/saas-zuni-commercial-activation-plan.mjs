import { authorize } from "@apidevelopers/auth-core";
import {
  createZuniActivationPlan,
  buildZuniActivationExecutionPlan,
} from "@apidevelopers/saas-runtime";

export const ZUNI_COMMERCIAL_ACTIVATION_PLAN_SCOPE = "saas:zuni:activation:plan";
const DELEGATED_ACCESS_SCOPE = "saas:access:delegate";
const DELEGATED_BACKEND_PRINCIPAL_ID = "backend-delegated";

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

function publicPlan(plan, executionPlan) {
  return Object.freeze({
    schemaVersion: 1,
    ok: true,
    productId: plan.productId,
    planId: plan.planId,
    activationMode: plan.activationMode,
    automaticCharge: false,
    productionWriteAuthorized: false,
    tenant: Object.freeze({
      tenantId: plan.tenant.tenantId,
      slug: plan.tenant.slug,
      displayName: plan.tenant.displayName,
      status: plan.tenant.status,
    }),
    workspace: Object.freeze({
      workspaceId: plan.workspace.workspaceId,
      tenantId: plan.workspace.tenantId,
      slug: plan.workspace.slug,
      displayName: plan.workspace.displayName,
      status: plan.workspace.status,
    }),
    subscription: Object.freeze({
      subscriptionId: plan.subscription.subscriptionId,
      planId: plan.subscription.planId,
      status: plan.subscription.status,
      currency: plan.subscription.currency,
      monthlyAmount: plan.subscription.monthlyAmount,
    }),
    entitlements: Object.freeze(
      plan.entitlements.map(({ record, kind, value }) => Object.freeze({
        entitlementId: record.entitlementId,
        capability: record.capability,
        status: record.status,
        kind,
        value,
      })),
    ),
    execution: Object.freeze({
      mode: executionPlan.mode,
      steps: executionPlan.steps,
      provisioningJobId: executionPlan.provisioningJob.provisioningJobId,
      provisioningStatus: executionPlan.provisioningJob.status,
      rollback: executionPlan.rollback,
    }),
    writesExecuted: false,
    chargeExecuted: false,
    secretsExposed: false,
  });
}

export function createZuniCommercialActivationPlanApp({ authenticator } = {}) {
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }

  return Object.freeze({
    async handleRequest({ method = "GET", url = "/", headers = {}, body = "" } = {}) {
      const pathname = new URL(String(url), "http://api-gateway.local").pathname;
      if (
        String(method).toUpperCase() !== "POST" ||
        pathname !== "/v1/saas/zuni/activation/plan"
      ) {
        return null;
      }

      const actor = await authenticator.authenticate(headers);
      if (!actor) return response(401, { ok: false, reason: "unauthorized" });

      const decision = authorize(actor, { scopes: [ZUNI_COMMERCIAL_ACTIVATION_PLAN_SCOPE] });
      if (!decision.allowed && !isTrustedDelegatedBackend(actor)) {
        return response(403, {
          ok: false,
          reason: "zuni_commercial_activation_plan_scope_forbidden",
          missingScopes: decision.missingScopes,
        });
      }

      try {
        const input = bodyOf(body);
        const activationPlan = createZuniActivationPlan({
          plan: input.plan,
          tenantSlug: input.tenantSlug,
          tenantDisplayName: input.tenantDisplayName,
          organizationId: input.organizationId,
          workspaceSlug: clean(input.workspaceSlug) || "principal",
          workspaceDisplayName: clean(input.workspaceDisplayName) || "Principal",
          ...(clean(input.createdAt) ? { createdAt: clean(input.createdAt) } : {}),
        });
        const executionPlan = buildZuniActivationExecutionPlan({ activationPlan });
        return response(200, publicPlan(activationPlan, executionPlan));
      } catch (error) {
        return response(400, {
          ok: false,
          reason: "invalid_zuni_commercial_activation_plan",
          message: error instanceof Error ? error.message : "invalid_activation_plan",
          writesExecuted: false,
          chargeExecuted: false,
          secretsExposed: false,
        });
      }
    },
  });
}
