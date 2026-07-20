
export const SUBSCRIPTION_STATUSES = Object.freeze([
  "pending",
  "active",
  "past_due",
  "suspended",
  "cancelled",
  "expired",
]);

export class SubscriptionDomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SubscriptionDomainError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

export function requireText(value, name) {
  const result = String(value ?? "").trim();
  if (!result) {
    throw new SubscriptionDomainError("invalid_argument", `${name} is required`);
  }
  return result;
}

export function requireIso(value, name) {
  const result = requireText(value, name);
  if (Number.isNaN(Date.parse(result))) {
    throw new SubscriptionDomainError("invalid_argument", `${name} must be ISO`);
  }
  return result;
}

export function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new SubscriptionDomainError("invalid_argument", `${name} must be a positive safe integer`);
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

function normalizePlan(input, prefix = "") {
  return {
    productId: requireText(input.productId, `${prefix}productId`),
    productVersion: requirePositiveInteger(input.productVersion, `${prefix}productVersion`),
    planId: requireText(input.planId, `${prefix}planId`),
    planVersion: requirePositiveInteger(input.planVersion, `${prefix}planVersion`),
  };
}

function validatePeriod(start, end) {
  const currentPeriodStart = requireIso(start, "currentPeriodStart");
  const currentPeriodEnd = requireIso(end, "currentPeriodEnd");
  if (Date.parse(currentPeriodStart) >= Date.parse(currentPeriodEnd)) {
    throw new SubscriptionDomainError(
      "invalid_billing_period",
      "currentPeriodStart must be before currentPeriodEnd",
    );
  }
  return { currentPeriodStart, currentPeriodEnd };
}

export function createSubscriptionSnapshot(input) {
  const status = requireText(input.status, "status");
  if (!SUBSCRIPTION_STATUSES.includes(status)) {
    throw new SubscriptionDomainError("invalid_subscription_status", "status is not supported");
  }

  const plan = normalizePlan(input);
  const period = validatePeriod(input.currentPeriodStart, input.currentPeriodEnd);
  const cancelAtPeriodEnd = Boolean(input.cancelAtPeriodEnd);
  const endedAt = input.endedAt == null ? null : requireIso(input.endedAt, "endedAt");
  const startedAt = input.startedAt == null ? null : requireIso(input.startedAt, "startedAt");
  const pendingChange = input.pendingChange == null
    ? null
    : {
        ...normalizePlan(input.pendingChange, "pendingChange."),
        effectiveAt: requireIso(input.pendingChange.effectiveAt, "pendingChange.effectiveAt"),
      };

  if (pendingChange && Date.parse(pendingChange.effectiveAt) < Date.parse(period.currentPeriodStart)) {
    throw new SubscriptionDomainError(
      "invalid_plan_change_effective_at",
      "pending plan change cannot precede current period",
    );
  }
  if (["cancelled", "expired"].includes(status) && !endedAt) {
    throw new SubscriptionDomainError("missing_ended_at", "terminal subscriptions require endedAt");
  }
  if (!["cancelled", "expired"].includes(status) && endedAt) {
    throw new SubscriptionDomainError("unexpected_ended_at", "non-terminal subscriptions cannot end");
  }
  if (status === "pending" && startedAt) {
    throw new SubscriptionDomainError("unexpected_started_at", "pending subscription cannot be started");
  }
  if (status !== "pending" && !startedAt) {
    throw new SubscriptionDomainError("missing_started_at", "startedAt is required after activation");
  }
  if (["cancelled", "expired"].includes(status) && (cancelAtPeriodEnd || pendingChange)) {
    throw new SubscriptionDomainError(
      "invalid_terminal_state",
      "terminal subscriptions cannot keep scheduled actions",
    );
  }

  return deepFreeze({
    snapshotId: requireText(input.snapshotId, "snapshotId"),
    subscriptionId: requireText(input.subscriptionId, "subscriptionId"),
    revision: requirePositiveInteger(input.revision, "revision"),
    tenantId: requireText(input.tenantId, "tenantId"),
    ...plan,
    status,
    billingInterval: requireText(input.billingInterval ?? "month", "billingInterval"),
    billingAnchor: requireIso(input.billingAnchor, "billingAnchor"),
    ...period,
    startedAt,
    endedAt,
    cancelAtPeriodEnd,
    pendingChange: pendingChange ? deepFreeze(pendingChange) : null,
    sourceEventId: requireText(input.sourceEventId, "sourceEventId"),
    previousSnapshotId:
      input.previousSnapshotId == null ? null : requireText(input.previousSnapshotId, "previousSnapshotId"),
    createdAt: requireIso(input.createdAt, "createdAt"),
    metadata: input.metadata ?? {},
  });
}

export function isTerminalSubscription(subscription) {
  return subscription.status === "cancelled" || subscription.status === "expired";
}
