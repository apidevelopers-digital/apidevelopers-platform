import {
  CheckoutDomainError,
  createCheckoutSnapshot,
  deepFreeze,
  isTerminalCheckout,
  requireIso,
  requireText,
} from "./model.mjs";

export function validateCatalogSelection(product, plan) {
  if (product?.status !== "READY_TO_SELL") {
    throw new CheckoutDomainError("product_not_sellable", "product must be READY_TO_SELL");
  }
  if (plan?.status !== "ACTIVE") {
    throw new CheckoutDomainError("plan_not_active", "plan must be ACTIVE");
  }
  if (plan.productId !== product.id || plan.productVersion !== product.version) {
    throw new CheckoutDomainError("plan_product_mismatch", "plan does not belong to selected product version");
  }
  if (!product.planIds?.includes(plan.id)) {
    throw new CheckoutDomainError("plan_not_declared_by_product", "product does not declare selected plan");
  }
  if (!Number.isSafeInteger(plan.unitAmount) || plan.unitAmount < 0) {
    throw new CheckoutDomainError("price_unresolved", "plan unitAmount must be resolved");
  }
  return deepFreeze({
    productId: requireText(product.id, "product.id"),
    productVersion: product.version,
    planId: requireText(plan.id, "plan.id"),
    planVersion: plan.version,
    amount: plan.unitAmount,
    currency: requireText(plan.currency ?? "BRL", "plan.currency").toUpperCase(),
  });
}

export function createCheckoutContext({
  repository,
  idFactory,
  clock,
  assertAccountOperational,
}) {
  if (typeof idFactory !== "function") {
    throw new CheckoutDomainError("invalid_argument", "idFactory must be a function");
  }
  const now = () => requireIso(clock(), "clock");
  const current = (checkoutId) => {
    const checkout = repository.getCurrent(checkoutId);
    if (!checkout) {
      throw new CheckoutDomainError(
        "checkout_not_found",
        "checkout was not found",
        { checkoutId },
      );
    }
    return checkout;
  };
  const duplicate = (sourceEventId) => {
    const snapshot = repository.getBySourceEventId(sourceEventId);
    return snapshot
      ? deepFreeze({
          snapshot,
          appended: false,
          duplicateOf: snapshot.snapshotId,
          events: [],
        })
      : null;
  };
  const mutable = (checkout) => {
    if (isTerminalCheckout(checkout)) {
      throw new CheckoutDomainError(
        "terminal_checkout",
        "terminal checkout cannot transition",
        { status: checkout.status },
      );
    }
  };

  function append(previous, sourceEventId, patch, eventType, eventData = {}) {
    const at = now();
    const snapshot = createCheckoutSnapshot({
      ...previous,
      ...patch,
      snapshotId: requireText(idFactory(), "idFactory result"),
      revision: previous.revision + 1,
      previousSnapshotId: previous.snapshotId,
      sourceEventId,
      createdAt: at,
    });
    const stored = repository.append(snapshot);
    return deepFreeze({
      ...stored,
      events: stored.appended
        ? [{
            type: eventType,
            checkoutId: stored.snapshot.checkoutId,
            accountId: stored.snapshot.accountId,
            occurredAt: at,
            data: eventData,
          }]
        : [],
    });
  }

  return Object.freeze({
    repository,
    assertAccountOperational,
    now,
    current,
    duplicate,
    mutable,
    append,
    idFactory,
  });
}
