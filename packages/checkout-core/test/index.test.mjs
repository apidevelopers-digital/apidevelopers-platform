import assert from "node:assert/strict";
import test from "node:test";
import {
  CheckoutDomainError,
  createCheckoutService,
  createCheckoutSnapshot,
  createMemoryCheckoutRepository,
} from "../src/index.mjs";

const T0 = "2026-07-20T00:00:00.000Z";
const T1 = "2026-07-20T01:00:00.000Z";
const T2 = "2026-07-20T02:00:00.000Z";

const product = (patch = {}) => ({
  id: "platform-core",
  version: 1,
  status: "READY_TO_SELL",
  planIds: ["developer", "team"],
  ...patch,
});
const plan = (patch = {}) => ({
  id: "developer",
  version: 1,
  productId: "platform-core",
  productVersion: 1,
  status: "ACTIVE",
  unitAmount: 9900,
  currency: "BRL",
  ...patch,
});

function service() {
  let id = 0;
  let tick = 0;
  return createCheckoutService({
    idFactory: () => `snap-${++id}`,
    clock: () => new Date(Date.parse(T0) + tick++ * 1000).toISOString(),
    assertAccountOperational: (accountId) => {
      if (accountId === "blocked") {
        throw new CheckoutDomainError("account_not_operational", "blocked");
      }
    },
  });
}

function create(s, patch = {}) {
  return s.createSession({
    checkoutId: "checkout-1",
    accountId: "account-1",
    product: product(),
    plan: plan(),
    provider: "provider-a",
    providerSessionId: "provider-session-1",
    redirectUrl: "https://checkout.example/session/1",
    idempotencyKey: "intent-1",
    sourceEventId: "create-1",
    expiresAt: T1,
    ...patch,
  });
}

test("creates immutable snapshots and rejects sensitive metadata", () => {
  const snapshot = createCheckoutSnapshot({
    snapshotId: "snap-1",
    checkoutId: "checkout-1",
    revision: 1,
    accountId: "account-1",
    productId: "platform-core",
    productVersion: 1,
    planId: "developer",
    planVersion: 1,
    amount: 9900,
    currency: "BRL",
    status: "pending",
    provider: "provider-a",
    providerSessionId: "provider-session-1",
    redirectUrl: "https://checkout.example/session/1",
    idempotencyKey: "intent-1",
    paymentReference: null,
    completedAt: null,
    cancelledAt: null,
    endedAt: null,
    expiresAt: T1,
    sourceEventId: "create-1",
    previousSnapshotId: null,
    createdAt: T0,
    metadata: { campaign: { id: "launch" } },
  });
  assert.throws(() => {
    snapshot.metadata.campaign.id = "changed";
  }, TypeError);
  assert.throws(
    () => create(service(), { metadata: { cardToken: "forbidden" } }),
    (error) => error.code === "sensitive_data_forbidden",
  );
});

test("validates sellable catalog and operational account", () => {
  assert.throws(
    () => create(service(), { product: product({ status: "SPECIFIED" }) }),
    (error) => error.code === "product_not_sellable",
  );
  assert.throws(
    () => create(service(), { plan: plan({ status: "DRAFT" }) }),
    (error) => error.code === "plan_not_active",
  );
  assert.throws(
    () => create(service(), { accountId: "blocked" }),
    (error) => error.code === "account_not_operational",
  );
});

test("creates a frozen pending intent and emits canonical event", () => {
  const result = create(service());
  assert.equal(result.snapshot.status, "pending");
  assert.equal(result.snapshot.amount, 9900);
  assert.equal(result.events[0].type, "checkout.session.created");
  assert.equal(result.events[0].data.provider, "provider-a");
});

test("deduplicates creation and rejects idempotency key conflicts", () => {
  const s = service();
  const first = create(s);
  const repeated = create(s, {
    checkoutId: "checkout-2",
    providerSessionId: "provider-session-2",
    sourceEventId: "create-2",
  });
  assert.equal(repeated.appended, false);
  assert.equal(repeated.snapshot.snapshotId, first.snapshot.snapshotId);
  assert.throws(
    () => create(s, {
      checkoutId: "checkout-3",
      plan: plan({ id: "team", version: 2 }),
      providerSessionId: "provider-session-3",
      sourceEventId: "create-3",
    }),
    (error) => error.code === "idempotency_key_conflict",
  );
});

test("repository is append-only, sequential and source-event idempotent", () => {
  const repo = createMemoryCheckoutRepository();
  const s = service();
  const first = create(s).snapshot;
  assert.equal(repo.append(first).appended, true);
  assert.equal(repo.append({ ...first, snapshotId: "other" }).appended, false);
  assert.throws(
    () => repo.append({
      ...first,
      snapshotId: "snap-x",
      sourceEventId: "other-event",
      revision: 3,
    }),
    (error) => error.code === "invalid_checkout_revision",
  );
});

test("completes only confirmed matching payments", () => {
  const s = service();
  create(s);
  assert.throws(
    () => s.completeSession({
      checkoutId: "checkout-1",
      sourceEventId: "payment-bad",
      providerSessionId: "provider-session-1",
      paymentReference: "payment-1",
      amount: 9800,
      currency: "BRL",
      completedAt: T0,
    }),
    (error) => error.code === "payment_amount_mismatch",
  );
  const completed = s.completeSession({
    checkoutId: "checkout-1",
    sourceEventId: "payment-1",
    providerSessionId: "provider-session-1",
    paymentReference: "payment-1",
    amount: 9900,
    currency: "BRL",
    completedAt: T0,
  });
  assert.equal(completed.snapshot.status, "completed");
  assert.equal(completed.events[0].type, "checkout.session.completed");
  assert.equal(completed.events[0].data.confirmed, true);
});

test("deduplicates repeated provider webhooks", () => {
  const s = service();
  create(s);
  const first = s.completeSession({
    checkoutId: "checkout-1",
    sourceEventId: "provider-event-1",
    providerSessionId: "provider-session-1",
    paymentReference: "payment-1",
    amount: 9900,
    currency: "BRL",
    completedAt: T0,
  });
  const repeated = s.completeSession({
    checkoutId: "checkout-1",
    sourceEventId: "provider-event-1",
    providerSessionId: "ignored",
    paymentReference: "ignored",
    amount: 1,
    currency: "USD",
    completedAt: T2,
  });
  assert.equal(repeated.appended, false);
  assert.equal(repeated.snapshot.snapshotId, first.snapshot.snapshotId);
  assert.deepEqual(repeated.events, []);
});

test("expires only after deadline and blocks terminal transitions", () => {
  const s = service();
  create(s);
  assert.throws(
    () => s.expireSession({
      checkoutId: "checkout-1",
      sourceEventId: "expire-early",
      at: T0,
    }),
    (error) => error.code === "checkout_not_expired",
  );
  const expired = s.expireSession({
    checkoutId: "checkout-1",
    sourceEventId: "expire-1",
    at: T1,
  });
  assert.equal(expired.snapshot.status, "expired");
  assert.throws(
    () => s.cancelSession({
      checkoutId: "checkout-1",
      sourceEventId: "cancel-late",
      at: T2,
    }),
    (error) => error.code === "terminal_checkout",
  );
});

test("cancels pending sessions and lists current account state", () => {
  const s = service();
  create(s);
  const cancelled = s.cancelSession({
    checkoutId: "checkout-1",
    sourceEventId: "cancel-1",
    reason: "customer_request",
    at: T0,
  });
  assert.equal(cancelled.snapshot.status, "cancelled");
  assert.equal(cancelled.events[0].type, "checkout.session.cancelled");
  assert.deepEqual(
    s.listCurrentByAccount("account-1").map((item) => item.status),
    ["cancelled"],
  );
});
