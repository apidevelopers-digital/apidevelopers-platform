const ACTIVE_COMMERCIAL_STATES = new Set(["early_access", "active"]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

function normalizePlanId(planId) {
  if (typeof planId !== "string" || planId.trim() === "") {
    throw new TypeError("planId must be a non-empty string");
  }
  return planId.trim().toLowerCase();
}

export const ZUNI_COMMERCIAL_CATALOG_V1 = deepFreeze({
  version: 1,
  product_id: "zuni",
  currency: "BRL",
  automatic_charge: false,
  billing_cycles: ["monthly", "annual"],
  plans: {
    start: {
      id: "start",
      checkout_app: "zuni_start",
      commercial_state: "early_access",
      pricing_status: "published",
      sellable: true,
      pricing: {
        monthly_cents: 29700,
        annual_total_cents: 297000,
        annual_monthly_equivalent_cents: 24750,
      },
      limits: {
        whatsapp_channels: 1,
        users: 3,
      },
      capabilities: {
        inbox: "included",
        contacts: "included",
        templates: "included",
        uni_co: "basic",
        support: "standard",
      },
    },
    pro: {
      id: "pro",
      checkout_app: "zuni_pro",
      commercial_state: "early_access",
      pricing_status: "published",
      sellable: true,
      pricing: {
        monthly_cents: 59700,
        annual_total_cents: 597000,
        annual_monthly_equivalent_cents: 49750,
      },
      limits: {
        whatsapp_channels: 2,
        users: 10,
      },
      capabilities: {
        inbox: "included",
        contacts: "included",
        templates: "included",
        uni_co: "expanded",
        api: "included",
        webhooks: "included",
        automations: "included",
        reports: "included",
        support: "standard",
      },
    },
    scale: {
      id: "scale",
      checkout_app: "zuni_scale",
      commercial_state: "early_access",
      pricing_status: "published",
      sellable: true,
      pricing: {
        monthly_cents: 129000,
        annual_total_cents: 1290000,
        annual_monthly_equivalent_cents: 107500,
      },
      limits: {
        whatsapp_channels: 5,
        users: 25,
      },
      capabilities: {
        inbox: "included",
        contacts: "included",
        templates: "included",
        uni_co: "expanded",
        api: "advanced",
        webhooks: "advanced",
        automations: "included",
        reports: "included",
        rbac: "included",
        audit: "included",
        support: "priority",
      },
    },
    master: {
      id: "master",
      checkout_app: "zuni_master",
      commercial_state: "preview",
      pricing_status: "proposal",
      sellable: false,
      inherits: "scale",
      pricing: {
        monthly_cents: 169000,
        annual_total_cents: null,
        annual_monthly_equivalent_cents: null,
      },
      limits: {},
      capabilities: {
        uni_co: "integrated",
        api: "governed",
        webhooks: "governed",
        documents: "included",
        operational_context: "included",
        assisted_operations: "included",
        audit: "included",
        support: "priority",
      },
    },
  },
});

export function getZuniCommercialCatalog() {
  return ZUNI_COMMERCIAL_CATALOG_V1;
}

export function resolveZuniPlanEntitlements(planId) {
  const id = normalizePlanId(planId);
  const startingPlan = ZUNI_COMMERCIAL_CATALOG_V1.plans[id];
  if (!startingPlan) return null;

  const chain = new Set();
  const limits = {};
  const capabilities = {};
  let cursor = startingPlan;

  for (let depth = 0; depth < 8; depth += 1) {
    const currentId = normalizePlanId(cursor.id);
    if (chain.has(currentId)) {
      throw new Error("invalid_plan_inheritance");
    }
    chain.add(currentId);

    for (const [name, value] of Object.entries(cursor.limits ?? {})) {
      if (!(name in limits)) limits[name] = value;
    }
    for (const [name, value] of Object.entries(cursor.capabilities ?? {})) {
      if (!(name in capabilities)) capabilities[name] = value;
    }

    if (!cursor.inherits) break;
    const parent = ZUNI_COMMERCIAL_CATALOG_V1.plans[normalizePlanId(cursor.inherits)];
    if (!parent) {
      throw new Error("missing_parent_plan");
    }
    cursor = parent;
  }

  return deepFreeze({
    version: 1,
    product_id: "zuni",
    plan_id: startingPlan.id,
    commercial_state: startingPlan.commercial_state,
    sellable: startingPlan.sellable === true,
    limits,
    capabilities,
  });
}

export function resolveZuniCommercialPlan(planId) {
  const id = normalizePlanId(planId);
  const plan = ZUNI_COMMERCIAL_CATALOG_V1.plans[id];
  if (!plan) return null;

  const entitlements = resolveZuniPlanEntitlements(id);
  return deepFreeze({
    ...plan,
    product_id: ZUNI_COMMERCIAL_CATALOG_V1.product_id,
    currency: ZUNI_COMMERCIAL_CATALOG_V1.currency,
    limits: entitlements.limits,
    capabilities: entitlements.capabilities,
  });
}

export function requireZuniSellableCommercialPlan(planId) {
  const plan = resolveZuniCommercialPlan(planId);
  if (!plan) {
    throw new Error("zuni_plan_not_found");
  }
  if (
    plan.sellable !== true ||
    plan.pricing_status !== "published" ||
    !ACTIVE_COMMERCIAL_STATES.has(plan.commercial_state)
  ) {
    throw new Error(`zuni_plan_not_sellable:${plan.id}`);
  }
  return plan;
}

export function listZuniCommercialPlans({ includePreview = false } = {}) {
  const plans = Object.keys(ZUNI_COMMERCIAL_CATALOG_V1.plans)
    .map((planId) => resolveZuniCommercialPlan(planId))
    .filter((plan) => includePreview || plan.commercial_state !== "preview");
  return Object.freeze(plans);
}
