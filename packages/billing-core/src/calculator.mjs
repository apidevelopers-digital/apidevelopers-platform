import {
  BillingDomainError,
  createInvoiceLine,
  deepFreeze,
  requireNonNegativeInteger,
  requireText,
} from "./model.mjs";

function assertPlan(plan) {
  if (plan?.status !== "ACTIVE") {
    throw new BillingDomainError("plan_not_active", "billing requires an ACTIVE plan");
  }
  if (!Number.isSafeInteger(plan.unitAmount) || plan.unitAmount < 0) {
    throw new BillingDomainError("plan_price_unresolved", "plan unitAmount must be resolved");
  }
  return plan;
}

export function calculateInvoiceLines({
  plan,
  usageTotals = {},
  overagePriceResolver,
  lineIdFactory,
  adjustments = [],
}) {
  const normalizedPlan = assertPlan(plan);
  if (typeof lineIdFactory !== "function") {
    throw new BillingDomainError("invalid_argument", "lineIdFactory must be a function");
  }
  if (typeof overagePriceResolver !== "function") {
    throw new BillingDomainError("invalid_argument", "overagePriceResolver must be a function");
  }

  const currency = requireText(normalizedPlan.currency ?? "BRL", "plan.currency").toUpperCase();
  const lines = [];

  if (normalizedPlan.unitAmount > 0) {
    lines.push(
      createInvoiceLine({
        id: lineIdFactory(),
        type: "recurring",
        description: `${normalizedPlan.name} recurring charge`,
        quantity: 1,
        unitAmount: normalizedPlan.unitAmount,
        currency,
        metadata: {
          planId: normalizedPlan.id,
          planVersion: normalizedPlan.version,
          billingInterval: normalizedPlan.billingInterval,
        },
      }),
    );
  }

  for (const meter of normalizedPlan.meters ?? []) {
    const quantity = requireNonNegativeInteger(
      usageTotals[meter.key] ?? 0,
      `usageTotals.${meter.key}`,
    );
    const includedUnits = requireNonNegativeInteger(
      meter.includedUnits ?? 0,
      `meter.${meter.key}.includedUnits`,
    );
    const overageUnits = Math.max(0, quantity - includedUnits);
    if (overageUnits === 0) continue;

    const unitAmount = overagePriceResolver({
      reference: meter.overagePriceReference,
      meter: deepFreeze(meter),
      plan: deepFreeze(normalizedPlan),
    });
    if (!Number.isSafeInteger(unitAmount) || unitAmount < 0) {
      throw new BillingDomainError(
        "overage_price_unresolved",
        `overage price for ${meter.key} must be a non-negative safe integer`,
      );
    }

    lines.push(
      createInvoiceLine({
        id: lineIdFactory(),
        type: "usage",
        description: `${meter.key} overage`,
        quantity: overageUnits,
        unitAmount,
        currency,
        meterKey: meter.key,
        metadata: { quantity, includedUnits, unit: meter.unit },
      }),
    );
  }

  for (const adjustment of adjustments) {
    lines.push(
      createInvoiceLine({
        ...adjustment,
        id: adjustment.id ?? lineIdFactory(),
        currency,
      }),
    );
  }

  return deepFreeze(lines);
}
