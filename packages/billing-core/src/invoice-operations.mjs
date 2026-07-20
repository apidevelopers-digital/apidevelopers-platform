import {
  BillingDomainError,
  createInvoiceSnapshot,
  deepFreeze,
  requireIso,
  requireText,
} from "./model.mjs";
import { calculateInvoiceLines } from "./calculator.mjs";

export function createInvoiceOperations(ctx) {
  const {
    repository,
    lineIdFactory,
    overagePriceResolver,
    assertTenantOperational,
    idFactory,
    now,
    current,
    duplicate,
    append,
  } = ctx;

  return {
    createDraft({
      invoiceId,
      subscription,
      plan,
      periodStart,
      periodEnd,
      dueAt,
      usageTotals = {},
      adjustments = [],
      sourceEventId,
      metadata = {},
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;

      const normalizedInvoiceId = requireText(invoiceId, "invoiceId");
      if (repository.getCurrent(normalizedInvoiceId)) {
        throw new BillingDomainError("invoice_already_exists", "invoice already exists");
      }
      if (!subscription || ["cancelled", "expired"].includes(subscription.status)) {
        throw new BillingDomainError(
          "subscription_not_billable",
          "terminal subscription cannot be billed",
        );
      }
      assertTenantOperational(subscription.tenantId);
      if (
        subscription.productId !== plan.productId ||
        subscription.productVersion !== plan.productVersion ||
        subscription.planId !== plan.id ||
        subscription.planVersion !== plan.version
      ) {
        throw new BillingDomainError(
          "subscription_plan_mismatch",
          "subscription and plan snapshots do not match",
        );
      }

      const lineItems = calculateInvoiceLines({
        plan,
        usageTotals,
        overagePriceResolver,
        lineIdFactory,
        adjustments,
      });
      const at = now();
      const snapshot = createInvoiceSnapshot({
        snapshotId: requireText(idFactory(), "idFactory result"),
        invoiceId: normalizedInvoiceId,
        revision: 1,
        tenantId: subscription.tenantId,
        subscriptionId: subscription.subscriptionId,
        productId: subscription.productId,
        productVersion: subscription.productVersion,
        planId: subscription.planId,
        planVersion: subscription.planVersion,
        status: "draft",
        currency: plan.currency,
        periodStart,
        periodEnd,
        dueAt,
        lineItems,
        payments: [],
        finalizedAt: null,
        paidAt: null,
        endedAt: null,
        sourceEventId,
        previousSnapshotId: null,
        createdAt: at,
        metadata,
      });
      const stored = repository.append(snapshot);
      return deepFreeze({
        ...stored,
        events: stored.appended
          ? [{
              type: "billing.invoice.created",
              invoiceId: snapshot.invoiceId,
              subscriptionId: snapshot.subscriptionId,
              tenantId: snapshot.tenantId,
              occurredAt: at,
              data: { total: snapshot.total, currency: snapshot.currency },
            }]
          : [],
      });
    },

    finalize({ invoiceId, sourceEventId, finalizedAt = now() }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(invoiceId);
      if (previous.status !== "draft") {
        throw new BillingDomainError(
          "invalid_invoice_transition",
          "only draft invoice can be finalized",
        );
      }
      return append(
        previous,
        sourceEventId,
        { status: "open", finalizedAt, paidAt: null, endedAt: null },
        "billing.invoice.finalized",
        { total: previous.total, dueAt: previous.dueAt },
      );
    },

    markPastDue({ invoiceId, sourceEventId, at = now() }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(invoiceId);
      if (previous.status !== "open") {
        throw new BillingDomainError(
          "invalid_invoice_transition",
          "only open invoice can become past_due",
        );
      }
      const normalizedAt = requireIso(at, "at");
      if (Date.parse(normalizedAt) < Date.parse(previous.dueAt)) {
        throw new BillingDomainError(
          "invoice_not_due",
          "invoice due date has not been reached",
        );
      }
      return append(
        previous,
        sourceEventId,
        { status: "past_due", paidAt: null, endedAt: null },
        "billing.invoice.past_due",
        { amountDue: previous.amountDue, dueAt: previous.dueAt },
      );
    },

    voidInvoice({ invoiceId, sourceEventId, reason, at = now() }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(invoiceId);
      if (["paid", "void", "uncollectible"].includes(previous.status)) {
        throw new BillingDomainError("terminal_invoice", "terminal invoice cannot be voided");
      }
      if (previous.amountPaid > 0) {
        throw new BillingDomainError(
          "paid_invoice_cannot_be_void",
          "invoice with payments cannot be voided",
        );
      }
      return append(
        previous,
        sourceEventId,
        {
          status: "void",
          finalizedAt: previous.finalizedAt ?? at,
          paidAt: null,
          endedAt: at,
        },
        "billing.invoice.voided",
        { reason: requireText(reason, "reason") },
      );
    },

    markUncollectible({ invoiceId, sourceEventId, reason, at = now() }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(invoiceId);
      if (previous.status !== "past_due") {
        throw new BillingDomainError(
          "invalid_invoice_transition",
          "only past_due invoice can become uncollectible",
        );
      }
      return append(
        previous,
        sourceEventId,
        { status: "uncollectible", paidAt: null, endedAt: at },
        "billing.invoice.uncollectible",
        { reason: requireText(reason, "reason"), amountDue: previous.amountDue },
      );
    },
  };
}
