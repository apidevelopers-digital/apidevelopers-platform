import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyPersistenceState,
} from "../src/model.mjs";
import {
  createTransactionContext,
} from "../src/transaction-context.mjs";

const T0 = "2026-07-21T02:00:00.000Z";
const T1 = "2026-07-21T02:01:00.000Z";
const T2 = "2026-07-21T02:02:00.000Z";

function fixture() {
  const draft = createEmptyPersistenceState(T0);
  const tx = createTransactionContext(draft, () => T0);
  tx.enqueueOutbox({ id: "e1", type: "tenant.created", occurredAt: T0 });
  tx.enqueueOutbox({ id: "e2", type: "project.created", occurredAt: T1 });
  return { draft, tx };
}

test("claims pending entries with an exclusive lease", () => {
  const { tx } = fixture();
  const claimed = tx.claimOutbox({
    workerId: "worker-a",
    limit: 1,
    at: T0,
    leaseUntil: T1,
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].id, "e1");
  assert.equal(claimed[0].status, "publishing");
  assert.equal(claimed[0].claimedBy, "worker-a");
  assert.deepEqual(
    tx.claimOutbox({
      workerId: "worker-b",
      limit: 10,
      at: T0,
      leaseUntil: T1,
    }).map((entry) => entry.id),
    ["e2"],
  );
});

test("reclaims an expired publishing lease", () => {
  const { tx } = fixture();
  tx.claimOutbox({
    workerId: "worker-a",
    limit: 1,
    at: T0,
    leaseUntil: T1,
  });
  const reclaimed = tx.claimOutbox({
    workerId: "worker-b",
    limit: 1,
    at: T1,
    leaseUntil: T2,
  });
  assert.equal(reclaimed[0].id, "e1");
  assert.equal(reclaimed[0].claimedBy, "worker-b");
});

test("completes only the owning claim", () => {
  const { tx } = fixture();
  tx.claimOutbox({
    workerId: "worker-a",
    limit: 1,
    at: T0,
    leaseUntil: T1,
  });
  assert.throws(
    () =>
      tx.completeOutboxClaim("e1", {
        workerId: "worker-b",
        publishedAt: T1,
      }),
    (error) => error.code === "outbox_claim_conflict",
  );
  const completed = tx.completeOutboxClaim("e1", {
    workerId: "worker-a",
    publishedAt: T1,
  });
  assert.equal(completed.status, "published");
  assert.equal(completed.attempts, 1);
  assert.equal(completed.claimedBy, null);
});

test("schedules retry and later dead-letters a failed claim", () => {
  const { tx } = fixture();
  tx.claimOutbox({
    workerId: "worker-a",
    limit: 1,
    at: T0,
    leaseUntil: T1,
  });
  const failed = tx.failOutboxClaim("e1", new Error("broker unavailable"), {
    workerId: "worker-a",
    nextAttemptAt: T1,
  });
  assert.equal(failed.status, "pending");
  assert.equal(failed.attempts, 1);
  assert.equal(failed.nextAttemptAt, T1);
  assert.equal(
    tx.claimOutbox({
      workerId: "worker-b",
      limit: 1,
      at: T0,
      leaseUntil: T1,
    })[0].id,
    "e2",
  );
  tx.claimOutbox({
    workerId: "worker-b",
    limit: 1,
    at: T1,
    leaseUntil: T2,
  });
  const dead = tx.failOutboxClaim("e1", new Error("still unavailable"), {
    workerId: "worker-b",
    deadLetter: true,
    deadLetteredAt: T2,
  });
  assert.equal(dead.status, "dead_letter");
  assert.equal(dead.attempts, 2);
  assert.equal(dead.deadLetteredAt, T2);
});
