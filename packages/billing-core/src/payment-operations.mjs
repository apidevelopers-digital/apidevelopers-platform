import {
  BillingDomainError,
  createPaymentRecord,
  isTerminalInvoice,
} from "./model.mjs";

export function createPaymentOperations(ctx) {
  const { now, current, duplicate, append } = ctx;

  return {
    recordPayment({
      invoiceId,
      paymentId,
      amount,
      sourceEventId,
      paidAt = now(),
      providerReference = null,
      metadata = {},
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(invoiceId);
      if (isTerminalInvoice(previous)) {
        throw new BillingDomainError(
          "terminal_invoice",
          "terminal invoice cannot receive payment",
          { status: previous.status },
        );
      }
      if (previous.status === "draft") {
        throw new BillingDomainError(
          "invoice_not_finalized",
          "draft invoice cannot receive payment",
        );
      }
      const payment = createPaymentRecord({
        id: paymentId,
        amount,
        sourceEventId,
        paidAt,
        providerReference,
        metadata,
      });
      if (payment.amount > previous.amountDue) {
        throw new BillingDomainError(
          "payment_exceeds_amount_due",
          "payment cannot exceed amount due",
        );
      }
      const payments = [...previous.payments, payment];
      const fullyPaid = payment.amount === previous.amountDue;
      return append(
        previous,
        sourceEventId,
        {
          payments,
          status: fullyPaid ? "paid" : previous.status,
          paidAt: fullyPaid ? paidAt : null,
          endedAt: null,
        },
        fullyPaid ? "billing.invoice.paid" : "billing.payment.recorded",
        {
          paymentId: payment.id,
          amount: payment.amount,
          amountDue: previous.amountDue - payment.amount,
        },
      );
    },
  };
}
