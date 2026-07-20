import assert from "node:assert/strict";
import test from "node:test";
import {
  provisioning,
  request,
  service,
  start,
  subscription,
  T1,
} from "./helpers.mjs";

test("starts activation and records active subscription", () => {
  const s = service();
  const started = start(s);
  assert.equal(started.snapshot.status, "running");
  assert.equal(started.snapshot.attempt, 1);
  const active = s.recordSubscriptionActivated({
    activationId: "activation-1",
    sourceEventId: "subscription-active-1",
    subscriptionId: "subscription-1",
  });
  assert.equal(active.snapshot.currentStep, "provisioning");
  assert.equal(active.events[0].type, "activation.subscription.completed");
});

test("requests and completes matching provisioning", () => {
  const s = service();
  subscription(s);
  s.recordProvisioningRequested({
    activationId: "activation-1",
    sourceEventId: "provisioning-requested-1",
    provisioningId: "provisioning-1",
  });
  assert.throws(
    () => s.recordProvisioningCompleted({
      activationId: "activation-1",
      sourceEventId: "provisioning-completed-bad",
      provisioningId: "provisioning-2",
    }),
    (error) => error.code === "provisioning_id_mismatch",
  );
  const completed = s.recordProvisioningCompleted({
    activationId: "activation-1",
    sourceEventId: "provisioning-completed-1",
    provisioningId: "provisioning-1",
  });
  assert.equal(completed.snapshot.currentStep, "finalize");
});

test("completes only after subscription and provisioning", () => {
  const s = service();
  provisioning(s);
  const completed = s.completeActivation({
    activationId: "activation-1",
    sourceEventId: "activation-completed-1",
    completedAt: T1,
  });
  assert.equal(completed.snapshot.status, "completed");
  assert.equal(completed.events[0].type, "activation.completed");
  assert.equal(completed.snapshot.completedAt, T1);
});

test("deduplicates repeated external events", () => {
  const s = service();
  request(s);
  const first = s.startActivation({
    activationId: "activation-1",
    sourceEventId: "start-same",
  });
  const repeated = s.startActivation({
    activationId: "activation-1",
    sourceEventId: "start-same",
  });
  assert.equal(first.appended, true);
  assert.equal(repeated.appended, false);
  assert.deepEqual(repeated.events, []);
});

test("fails with reverse compensation and requires completion before retry", () => {
  const s = service();
  subscription(s);
  s.recordProvisioningRequested({
    activationId: "activation-1",
    sourceEventId: "provisioning-requested-1",
    provisioningId: "provisioning-1",
  });
  const failed = s.failActivation({
    activationId: "activation-1",
    sourceEventId: "activation-failed-1",
    code: "provisioning_timeout",
    message: "provisioning timed out",
    step: "provisioning",
    retryable: true,
  });
  assert.deepEqual(
    failed.snapshot.compensation.map((item) => item.action),
    ["cancel_provisioning", "cancel_subscription"],
  );
  assert.throws(
    () => s.retryActivation({
      activationId: "activation-1",
      sourceEventId: "retry-early",
    }),
    (error) => error.code === "compensation_pending",
  );
  for (const action of ["cancel_provisioning", "cancel_subscription"]) {
    s.recordCompensation({
      activationId: "activation-1",
      sourceEventId: `compensate-${action}`,
      action,
      status: "completed",
    });
  }
  const retried = s.retryActivation({
    activationId: "activation-1",
    sourceEventId: "retry-1",
  });
  assert.equal(retried.snapshot.status, "running");
  assert.equal(retried.snapshot.attempt, 2);
  assert.equal(retried.snapshot.currentStep, "subscription");
});

test("cancels non-terminal activation and blocks later transitions", () => {
  const s = service();
  start(s);
  const cancelled = s.cancelActivation({
    activationId: "activation-1",
    sourceEventId: "cancel-1",
    reason: "customer_request",
    at: T1,
  });
  assert.equal(cancelled.snapshot.status, "cancelled");
  assert.throws(
    () => s.recordSubscriptionActivated({
      activationId: "activation-1",
      sourceEventId: "subscription-after-cancel",
      subscriptionId: "subscription-1",
    }),
    (error) => error.code === "terminal_activation",
  );
});
