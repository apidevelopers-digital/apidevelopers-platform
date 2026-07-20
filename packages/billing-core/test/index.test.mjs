import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateInvoiceLines,
  createBillingService,
  createInvoiceLine,
  createInvoiceSnapshot,
  createMemoryBillingRepository,
} from "../src/index.mjs";

const T0 = "2026-07-20T00:00:00.000Z";
const T1 = "2026-08-20T00:00:00.000Z";
const DUE = "2026-08-25T00:00:00.000Z";
const LATE = "2026-08-26T00:00:00.000Z";

const plan = (patch = {}) => ({
  id: "developer",
  version: 1,
  productId: "platform-core",
  productVersion: 1,
  name: "Developer",
  status: "ACTIVE",
  currency: "BRL",
  unitAmount: 9900,
  billingInterval: "month",
  meters: [{
    key: "requests",
    unit: "request",
    includedUnits: 1000,
    overagePriceReference: "request-unit",
  }],
  ...patch,
});

const subscription = (patch = {}) => ({
  subscriptionId: "sub-1",
  tenantId: "tenant-1",
  productId: "platform-core",
  productVersion: 1,
  planId: "developer",
  planVersion: 1,
  status: "active",
  ...patch,
});

function service() {
  let id = 0;
  let line = 0;
  let tick = 0;
  return createBillingService({
    idFactory: () => `snap-${++id}`,
    lineIdFactory: () => `line-${++line}`,
    clock: () => new Date(Date.parse(T0) + tick++ * 1000).toISOString(),
    overagePriceResolver: ({ reference }) => {
      assert.equal(reference, "request-unit");
      return 2;
    },
  });
}

function draft(s, patch = {}) {
  return s.createDraft({
    invoiceId: "inv-1",
    subscription: subscription(),
    plan: plan(),
    periodStart: T0,
    periodEnd: T1,
    dueAt: DUE,
    usageTotals: { requests: 1250 },
    sourceEventId: "invoice-create-1",
    ...patch,
  });
}

test("creates immutable monetary line items", () => {
  const line = createInvoiceLine({
    id: "line-1",
    type: "usage",
    description: "Requests",
    quantity: 3,
    unitAmount: 2,
  });
  assert.equal(line.amount, 6);
  assert.throws(() => {
    line.metadata.changed = true;
  }, TypeError);
  assert.throws(
    () => createInvoiceLine({
      id: "credit-1",
      type: "credit",
      description: "Credit",
      quantity: 1,
      unitAmount: 100,
    }),
    (error) => error.code === "invalid_line_item_amount",
  );
});

test("calculates recurring, overage, credit and adjustment lines", () => {
  let line = 0;
  const result = calculateInvoiceLines({
    plan: plan(),
    usageTotals: { requests: 1250 },
    overagePriceResolver: () => 2,
    lineIdFactory: () => `line-${++line}`,
    adjustments: [{
      type: "credit",
      description: "Service credit",
      quantity: 1,
      unitAmount: -100,
    }],
  });
  assert.deepEqual(result.map((item) => item.amount), [9900, 500, -100]);
});

test("validates invoice arithmetic and snapshots", () => {
  const snapshot = createInvoiceSnapshot({
    snapshotId: "snap-1",
    invoiceId: "inv-1",
    revision: 1,
    tenantId: "tenant-1",
    subscriptionId: "sub-1",
    productId: "platform-core",
    productVersion: 1,
    planId: "developer",
    planVersion: 1,
    status: "draft",
    currency: "BRL",
    periodStart: T0,
    periodEnd: T1,
    dueAt: DUE,
    lineItems: [{
      id: "line-1",
      type: "recurring",
      description: "Base",
      quantity: 1,
      unitAmount: 9900,
      currency: "BRL",
    }],
    payments: [],
    finalizedAt: null,
    paidAt: null,
    endedAt: null,
    sourceEventId: "create-1",
    previousSnapshotId: null,
    createdAt: T0,
  });
  assert.equal(snapshot.total, 9900);
  assert.equal(snapshot.amountDue, 9900);
});

test("repository is append-only, sequential and idempotent", () => {
  const repo = createMemoryBillingRepository();
  const s = service();
  const first = draft(s).snapshot;
  assert.equal(repo.append(first).appended, true);
  assert.equal(repo.append({ ...first, snapshotId: "other" }).appended, false);
  assert.throws(
    () => repo.append({
      ...first,
      snapshotId: "snap-x",
      sourceEventId: "other-event",
      revision: 3,
    }),
    (error) => error.code === "invalid_invoice_revision",
  );
});

test("creates and finalizes deterministic invoices", () => {
  const s = service();
  const created = draft(s);
  assert.equal(created.snapshot.status, "draft");
  assert.equal(created.snapshot.total, 10400);
  const opened = s.finalize({
    invoiceId: "inv-1",
    sourceEventId: "finalize-1",
    finalizedAt: T1,
  });
  assert.equal(opened.snapshot.status, "open");
  assert.equal(opened.events[0].type, "billing.invoice.finalized");
});

test("records partial and full payments idempotently", () => {
  const s = service();
  draft(s);
  s.finalize({ invoiceId: "inv-1", sourceEventId: "finalize-1", finalizedAt: T1 });
  const partial = s.recordPayment({
    invoiceId: "inv-1",
    paymentId: "pay-1",
    amount: 400,
    sourceEventId: "payment-event-1",
    paidAt: T1,
  });
  assert.equal(partial.snapshot.status, "open");
  assert.equal(partial.snapshot.amountDue, 10000);
  const repeated = s.recordPayment({
    invoiceId: "inv-1",
    paymentId: "pay-other",
    amount: 1,
    sourceEventId: "payment-event-1",
    paidAt: T1,
  });
  assert.equal(repeated.appended, false);
  const paid = s.recordPayment({
    invoiceId: "inv-1",
    paymentId: "pay-2",
    amount: 10000,
    sourceEventId: "payment-event-2",
    paidAt: LATE,
  });
  assert.equal(paid.snapshot.status, "paid");
  assert.equal(paid.snapshot.amountDue, 0);
  assert.equal(paid.events[0].type, "billing.invoice.paid");
});

test("marks overdue only after due date and emits subscription signal", () => {
  const s = service();
  draft(s);
  s.finalize({ invoiceId: "inv-1", sourceEventId: "finalize-1", finalizedAt: T1 });
  assert.throws(
    () => s.markPastDue({
      invoiceId: "inv-1",
      sourceEventId: "late-early",
      at: T1,
    }),
    (error) => error.code === "invoice_not_due",
  );
  const late = s.markPastDue({
    invoiceId: "inv-1",
    sourceEventId: "late-1",
    at: LATE,
  });
  assert.equal(late.snapshot.status, "past_due");
  assert.equal(late.events[0].type, "billing.invoice.past_due");
});

test("voids unpaid invoices and blocks terminal payments", () => {
  const s = service();
  draft(s);
  const voided = s.voidInvoice({
    invoiceId: "inv-1",
    sourceEventId: "void-1",
    reason: "duplicate",
    at: T1,
  });
  assert.equal(voided.snapshot.status, "void");
  assert.equal(voided.snapshot.amountDue, 0);
  assert.throws(
    () => s.recordPayment({
      invoiceId: "inv-1",
      paymentId: "pay-late",
      amount: 1,
      sourceEventId: "pay-late-event",
      paidAt: T1,
    }),
    (error) => error.code === "terminal_invoice",
  );
});

test("marks past-due invoice uncollectible and rejects plan mismatch", () => {
  const s = service();
  assert.throws(
    () => draft(s, { plan: plan({ version: 2 }) }),
    (error) => error.code === "subscription_plan_mismatch",
  );

  const other = service();
  draft(other);
  other.finalize({
    invoiceId: "inv-1",
    sourceEventId: "finalize-1",
    finalizedAt: T1,
  });
  other.markPastDue({
    invoiceId: "inv-1",
    sourceEventId: "past-due-1",
    at: LATE,
  });
  const result = other.markUncollectible({
    invoiceId: "inv-1",
    sourceEventId: "uncollectible-1",
    reason: "collection_exhausted",
    at: LATE,
  });
  assert.equal(result.snapshot.status, "uncollectible");
  assert.equal(result.events[0].type, "billing.invoice.uncollectible");
});
