export const CHECKOUT_STATUSES = Object.freeze([
  "pending",
  "completed",
  "expired",
  "cancelled",
]);

export class CheckoutDomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CheckoutDomainError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

export function requireText(value, name) {
  const result = String(value ?? "").trim();
  if (!result) throw new CheckoutDomainError("invalid_argument", `${name} is required`);
  return result;
}

export function requireIso(value, name) {
  const result = requireText(value, name);
  if (Number.isNaN(Date.parse(result))) {
    throw new CheckoutDomainError("invalid_argument", `${name} must be an ISO date`);
  }
  return result;
}

export function requireNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CheckoutDomainError("invalid_argument", `${name} must be a non-negative safe integer`);
  }
  return value;
}

export function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new CheckoutDomainError("invalid_argument", `${name} must be a positive safe integer`);
  }
  return value;
}

export function deepFreeze(value) {
  const copy = structuredClone(value);
  (function freeze(node) {
    if (node && typeof node === "object" && !Object.isFrozen(node)) {
      Object.values(node).forEach(freeze);
      Object.freeze(node);
    }
  })(copy);
  return copy;
}

const SENSITIVE_KEY = /(authorization|bearer|password|secret|token|card|cvv|cvc|pan)/i;

export function assertNoSensitiveData(value, path = "metadata") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      throw new CheckoutDomainError(
        "sensitive_data_forbidden",
        `${path}.${key} cannot be stored by checkout-core`,
      );
    }
    assertNoSensitiveData(nested, `${path}.${key}`);
  }
}

export function createCheckoutSnapshot(input) {
  const status = requireText(input.status, "status");
  if (!CHECKOUT_STATUSES.includes(status)) {
    throw new CheckoutDomainError("invalid_checkout_status", "checkout status is not supported");
  }

  const createdAt = requireIso(input.createdAt, "createdAt");
  const expiresAt = requireIso(input.expiresAt, "expiresAt");
  if (Date.parse(expiresAt) <= Date.parse(createdAt)) {
    throw new CheckoutDomainError("invalid_checkout_expiry", "expiresAt must be after createdAt");
  }

  const completedAt = input.completedAt == null ? null : requireIso(input.completedAt, "completedAt");
  const cancelledAt = input.cancelledAt == null ? null : requireIso(input.cancelledAt, "cancelledAt");
  const endedAt = input.endedAt == null ? null : requireIso(input.endedAt, "endedAt");

  if (status === "completed" && !completedAt) {
    throw new CheckoutDomainError("missing_completed_at", "completed checkout requires completedAt");
  }
  if (status === "cancelled" && !cancelledAt) {
    throw new CheckoutDomainError("missing_cancelled_at", "cancelled checkout requires cancelledAt");
  }
  if (["expired", "cancelled"].includes(status) && !endedAt) {
    throw new CheckoutDomainError("missing_ended_at", "expired and cancelled checkout require endedAt");
  }
  if (status === "pending" && (completedAt || cancelledAt || endedAt)) {
    throw new CheckoutDomainError("invalid_pending_checkout", "pending checkout cannot have terminal timestamps");
  }
  if (status !== "completed" && completedAt) {
    throw new CheckoutDomainError("unexpected_completed_at", "only completed checkout can have completedAt");
  }
  if (status !== "cancelled" && cancelledAt) {
    throw new CheckoutDomainError("unexpected_cancelled_at", "only cancelled checkout can have cancelledAt");
  }

  const metadata = input.metadata ?? {};
  assertNoSensitiveData(metadata);
  const paymentReference = input.paymentReference == null
    ? null
    : requireText(input.paymentReference, "paymentReference");
  if (status === "completed" && !paymentReference) {
    throw new CheckoutDomainError("missing_payment_reference", "completed checkout requires paymentReference");
  }

  return deepFreeze({
    snapshotId: requireText(input.snapshotId, "snapshotId"),
    checkoutId: requireText(input.checkoutId, "checkoutId"),
    revision: requirePositiveInteger(input.revision, "revision"),
    accountId: requireText(input.accountId, "accountId"),
    productId: requireText(input.productId, "productId"),
    productVersion: requirePositiveInteger(input.productVersion, "productVersion"),
    planId: requireText(input.planId, "plan_id"),
    planVersion: requirePositiveInteger(input.planVersion, "planVersion"),
    amount: requireNonNegativeInteger(input.amount, "amount"),
    currency: requireText(input.currency, "currency").toUpperCase(),
    status,
    provider: requireText(input.provider, "provider"),
    providerSessionId: requireText(input.providerSessionId, "providerSessionId"),
    redirectUrl: requireText(input.redirectUrl, "redirectUrl"),
    idempotencyKey: requireText(input.idempotencyKey, "idempotencyKey"),
    paymentReference,
    completedAt,
    cancelledAt,
    endedAt,
    expiresAt,
    sourceEventId: requireText(input.sourceEventId, "sourceEventId"),
    previousSnapshotId: input.previousSnapshotId == null
      ? null
      : requireText(input.previousSnapshotId, "previousSnapshotId"),
    createdAt,
    metadata,
  });
}

export function isTerminalCheckout(checkout) {
  return ["completed", "expired", "cancelled"].includes(checkout.status);
}
