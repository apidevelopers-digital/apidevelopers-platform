export const INVOICE_STATUSES = Object.freeze([
  "draft",
  "open",
  "paid",
  "past_due",
  "void",
  "uncollectible",
]);

export const LINE_ITEM_TYPES = Object.freeze([
  "recurring",
  "usage",
  "credit",
  "adjustment",
]);

export class BillingDomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "BillingDomainError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

export function requireText(value, name) {
  const result = String(value ?? "").trim();
  if (!result) throw new BillingDomainError("invalid_argument", `${name} is required`);
  return result;
}

export function requireIso(value, name) {
  const result = requireText(value, name);
  if (Number.isNaN(Date.parse(result))) {
    throw new BillingDomainError("invalid_argument", `${name} must be an ISO date`);
  }
  return result;
}

export function requireNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BillingDomainError("invalid_argument", `${name} must be a non-negative safe integer`);
  }
  return value;
}

export function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BillingDomainError("invalid_argument", `${name} must be a positive safe integer`);
  }
  return value;
}

export function requireSignedInteger(value, name) {
  if (!Number.isSafeInteger(value)) {
    throw new BillingDomainError("invalid_argument", `${name} must be a safe integer`);
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

export function createInvoiceLine({
  id,
  type,
  description,
  quantity = 1,
  unitAmount,
  currency = "BRL",
  meterKey = null,
  metadata = {},
}) {
  const normalizedType = requireText(type, "type");
  if (!LINE_ITEM_TYPES.includes(normalizedType)) {
    throw new BillingDomainError("invalid_line_item_type", "line item type is not supported");
  }
  const normalizedUnitAmount = requireSignedInteger(unitAmount, "unitAmount");
  if (["recurring", "usage"].includes(normalizedType) && normalizedUnitAmount < 0) {
    throw new BillingDomainError("invalid_line_item_amount", "recurring and usage lines cannot be negative");
  }
  if (normalizedType === "credit" && normalizedUnitAmount > 0) {
    throw new BillingDomainError("invalid_line_item_amount", "credit lines cannot be positive");
  }
  const normalizedQuantity = requirePositiveInteger(quantity, "quantity");
  const amount = normalizedQuantity * normalizedUnitAmount;
  if (!Number.isSafeInteger(amount)) {
    throw new BillingDomainError("amount_overflow", "line item amount exceeds safe integer range");
  }
  return deepFreeze({
    id: requireText(id, "id"),
    type: normalizedType,
    description: requireText(description, "description"),
    quantity: normalizedQuantity,
    unitAmount: normalizedUnitAmount,
    amount,
    currency: requireText(currency, "currency").toUpperCase(),
    meterKey: meterKey === null ? null : requireText(meterKey, "meterKey"),
    metadata,
  });
}

export function createPaymentRecord({
  id,
  amount,
  sourceEventId,
  paidAt,
  providerReference = null,
  metadata = {},
}) {
  return deepFreeze({
    id: requireText(id, "payment.id"),
    amount: requirePositiveInteger(amount, "payment.amount"),
    sourceEventId: requireText(sourceEventId, "payment.sourceEventId"),
    paidAt: requireIso(paidAt, "payment.paidAt"),
    providerReference:
      providerReference === null ? null : requireText(providerReference, "payment.providerReference"),
    metadata,
  });
}

export function createInvoiceSnapshot(input) {
  const status = requireText(input.status, "status");
  if (!INVOICE_STATUSES.includes(status)) {
    throw new BillingDomainError("invalid_invoice_status", "invoice status is not supported");
  }

  const periodStart = requireIso(input.periodStart, "periodStart");
  const periodEnd = requireIso(input.periodEnd, "periodEnd");
  if (Date.parse(periodStart) >= Date.parse(periodEnd)) {
    throw new BillingDomainError("invalid_billing_period", "periodStart must be before periodEnd");
  }

  const currency = requireText(input.currency, "currency").toUpperCase();
  const lineItems = (input.lineItems ?? []).map(createInvoiceLine);
  if (lineItems.some((line) => line.currency !== currency)) {
    throw new BillingDomainError("currency_mismatch", "all line items must use invoice currency");
  }
  const total = lineItems.reduce((sum, line) => sum + line.amount, 0);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new BillingDomainError("invalid_invoice_total", "invoice total must be a non-negative safe integer");
  }

  const payments = (input.payments ?? []).map(createPaymentRecord);
  const amountPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  if (!Number.isSafeInteger(amountPaid) || amountPaid > total) {
    throw new BillingDomainError("invalid_amount_paid", "payments cannot exceed invoice total");
  }

  const terminal = ["paid", "void", "uncollectible"].includes(status);
  const amountDue = status === "void" ? 0 : total - amountPaid;
  if (status === "paid" && amountDue !== 0) {
    throw new BillingDomainError("invoice_not_fully_paid", "paid invoice must have zero amount due");
  }
  if (status === "draft" && payments.length > 0) {
    throw new BillingDomainError("draft_has_payments", "draft invoice cannot contain payments");
  }
  if (status === "void" && amountPaid > 0) {
    throw new BillingDomainError("paid_invoice_cannot_be_void", "invoice with payments cannot be void");
  }

  const finalizedAt = input.finalizedAt === null ? null : requireIso(input.finalizedAt, "finalizedAt");
  const paidAt = input.paidAt === null ? null : requireIso(input.paidAt, "paidAt");
  const endedAt = input.endedAt === null ? null : requireIso(input.endedAt, "endedAt");
  if (status === "draft" && finalizedAt !== null) {
    throw new BillingDomainError("draft_finalized", "draft invoice cannot be finalized");
  }
  if (status !== "draft" && finalizedAt === null) {
    throw new BillingDomainError("missing_finalized_at", "non-draft invoice requires finalizedAt");
  }
  if (status === "paid" && paidAt === null) {
    throw new BillingDomainError("missing_paid_at", "paid invoice requires paidAt");
  }
  if (status !== "paid" && paidAt !== null) {
    throw new BillingDomainError("unexpected_paid_at", "only paid invoice can have paidAt");
  }
  if (terminal && status !== "paid" && endedAt === null) {
    throw new BillingDomainError("missing_ended_at", "void and uncollectible invoices require endedAt");
  }
  if (!terminal && endedAt !== null) {
    throw new BillingDomainError("unexpected_ended_at", "non-terminal invoice cannot have endedAt");
  }

  return deepFreeze({
    snapshotId: requireText(input.snapshotId, "snapshotId"),
    invoiceId: requireText(input.invoiceId, "invoiceId"),
    revision: requirePositiveInteger(input.revision, "revision"),
    tenantId: requireText(input.tenantId, "tenantId"),
    subscriptionId: requireText(input.subscriptionId, "subscriptionId"),
    productId: requireText(input.productId, "productId"),
    productVersion: requirePositiveInteger(input.productVersion, "productVersion"),
    planId: requireText(input.planId, "planId"),
    planVersion: requirePositiveInteger(input.planVersion, "planVersion"),
    status,
    currency,
    periodStart,
    periodEnd,
    dueAt: requireIso(input.dueAt, "dueAt"),
    lineItems,
    total,
    payments,
    amountPaid,
    amountDue,
    finalizedAt,
    paidAt,
    endedAt,
    sourceEventId: requireText(input.sourceEventId, "sourceEventId"),
    previousSnapshotId:
      input.previousSnapshotId === null
        ? null
        : requireText(input.previousSnapshotId, "previousSnapshotId"),
    createdAt: requireIso(input.createdAt, "createdAt"),
    metadata: input.metadata ?? {},
  });
}

export function isTerminalInvoice(invoice) {
  return ["paid", "void", "uncollectible"].includes(invoice.status);
}
