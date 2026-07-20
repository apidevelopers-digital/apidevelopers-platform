import assert from "node:assert/strict";
import test from "node:test";
import {
  createActivationSnapshot,
  createMemoryActivationRepository,
} from "../src/index.mjs";
import {
  T0,
  checkoutEvent,
  request,
  service,
} from "./helpers.mjs";

test("creates immutable snapshots and rejects sensitive metadata", () => {
  const snapshot = createActivationSnapshot({
    snapshotId: "snap-1",
    activationId: "activation-1",
    revision: 1,
    checkout: {
      id: "checkout-1",
      accountId: "account-1",
      productId: "platform-core",
      productVersion: 1,
      planId: "developer",
      planVersion: 1,
      paymentReference: "payment-1",
      confirmed: true,
    },
    status: "requested",
    attempt: 0,
    currentStep: "subscription",
    subscription: null,
    provisioning: null,
    failure: null,
    compensation: [],
    sourceEventId: "event-1",
    previousSnapshotId: null,
    createdAt: T0,
    completedAt: null,
    endedAt: null,
    metadata: { campaign: { id: "launch" } },
  });
  assert.throws(() => {
    snapshot.metadata.campaign.id = "changed";
  }, TypeError);
  assert.throws(
    () => request(service(), { metadata: { apiKeySecret: "forbidden" } }),
    (error) => error.code === "sensitive_data_forbidden",
  );
});

test("requires checkout.session.completed with confirmed payment", () => {
  assert.throws(
    () => request(service(), {
      checkoutEvent: checkoutEvent({ type: "checkout.session.created" }),
    }),
    (error) => error.code === "unsupported_checkout_event",
  );
  assert.throws(
    () => request(service(), {
      checkoutEvent: checkoutEvent({ data: { confirmed: false } }),
    }),
    (error) => error.code === "checkout_not_confirmed",
  );
});

test("repository is append-only, sequential and source-event idempotent", () => {
  const repo = createMemoryActivationRepository();
  const s = service();
  const first = request(s).snapshot;
  assert.equal(repo.append(first).appended, true);
  assert.equal(repo.append({ ...first, snapshotId: "other" }).appended, false);
  assert.throws(
    () => repo.append({
      ...first,
      snapshotId: "snap-x",
      sourceEventId: "other-event",
      revision: 3,
    }),
    (error) => error.code === "invalid_activation_revision",
  );
});

test("creates one idempotent activation per checkout", () => {
  const s = service();
  const first = request(s);
  const repeated = request(s, {
    activationId: "activation-2",
    sourceEventId: "checkout-completed-2",
  });
  assert.equal(first.snapshot.status, "requested");
  assert.equal(repeated.appended, false);
  assert.equal(repeated.snapshot.activationId, "activation-1");
});
