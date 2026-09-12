import {
  createZuniActivationPlan,
  listZuniCommercialPlans,
  requireZuniSellableCommercialPlan,
} from "@apidevelopers/saas-runtime";

const ALLOWED_ACTIVATION_FIELDS = new Set([
  "planId",
  "tenantSlug",
  "tenantDisplayName",
  "organizationId",
  "workspaceSlug",
  "workspaceDisplayName",
]);

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function assertActivationInputBoundary(input) {
  for (const key of Object.keys(input)) {
    if (!ALLOWED_ACTIVATION_FIELDS.has(key)) {
      throw new Error(`zuni_activation_input_field_not_allowed:${key}`);
    }
  }
}

function toPublicPlan(plan) {
  return Object.freeze({
    id: plan.id,
    productId: plan.product_id,
    currency: plan.currency,
    commercialState: plan.commercial_state,
    pricingStatus: plan.pricing_status,
    sellable: plan.sellable,
    pricing: Object.freeze({ ...plan.pricing }),
    limits: Object.freeze({ ...plan.limits }),
    capabilities: Object.freeze({ ...plan.capabilities }),
  });
}

export function createZuniCommercialService({
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }

  return Object.freeze({
    listPlans() {
      return Object.freeze({
        schemaVersion: 1,
        productId: "zuni",
        planSource: "server-catalog",
        automaticCharge: false,
        plans: Object.freeze(listZuniCommercialPlans().map(toPublicPlan)),
      });
    },

    createActivationPreview(input) {
      const request = requireObject(input, "input");
      assertActivationInputBoundary(request);

      const plan = requireZuniSellableCommercialPlan(
        requireText(request.planId, "planId"),
      );
      const activationPlan = createZuniActivationPlan({
        plan,
        tenantSlug: requireText(request.tenantSlug, "tenantSlug"),
        tenantDisplayName: requireText(
          request.tenantDisplayName,
          "tenantDisplayName",
        ),
        organizationId: requireText(request.organizationId, "organizationId"),
        workspaceSlug:
          typeof request.workspaceSlug === "string" &&
          request.workspaceSlug.trim() !== ""
            ? request.workspaceSlug.trim()
            : "principal",
        workspaceDisplayName:
          typeof request.workspaceDisplayName === "string" &&
          request.workspaceDisplayName.trim() !== ""
            ? request.workspaceDisplayName.trim()
            : "Principal",
        createdAt: now(),
      });

      return Object.freeze({
        schemaVersion: 1,
        mode: "dry-run",
        productId: "zuni",
        planSource: "server-catalog",
        automaticCharge: false,
        productionWriteAuthorized: false,
        activationPlan,
      });
    },
  });
}
