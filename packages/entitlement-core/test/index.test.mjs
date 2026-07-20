import assert from "node:assert/strict";
import test from "node:test";

import {
  EntitlementDomainError,
  createEntitlementService,
  createEntitlementSnapshot,
  createMemoryEntitlementRepository,
  isSnapshotEffective,
} from "../src/index.mjs";

const at = "2026-07-20T19:00:00.000Z";

const product = (overrides = {}) => ({
  id: "platform-core",
  version: 1,
  status: "READY_TO_SELL",
  apiIds: ["catalog", "identity", "projects"],
  planIds: ["developer", "team"],
  ...overrides,
});

const plan = (overrides = {}) => ({
  id: "developer",
  productId: "platform-core",
  version: 1,
  status: "ACTIVE",
  entitlements: [
    {
      key: "projects.max",
      value: 3,
      scope: "tenant",
      enforcement: "hard",
      overage: "deny",
      metadata: { source: { catalog: "v1" } },
    },
  ],
  meters: [
    {
      key: "api.requests",
      unit: "request",
      aggregation: "sum",
      period: "month",
      includedUnits: 10000,
      overagePriceReference: "OVERAGE_APPROVED_2026_01",
    },
  ],
  ...overrides,
});

const snapshot = (overrides = {}) =>
  createEntitlementSnapshot({
    id: "ent-1",
    revision: 1,
    tenantId: "tenant-1",
    subscriptionId: "sub-1",
    productId: "platform-core",
    productVersion: 1,
    planId: "developer",
    planVersion: 1,
    status: "active",
    apiIds: ["catalog"],
    entitlements: [{ key: "projects.max", value: 3 }],
    meters: [{ key: "api.requests", unit: "request", includedUnits: 10000 }],
    effectiveFrom: at,
    sourceEventId: "evt-1",
    createdAt: at,
    ...overrides,
  });

function service() {
  let sequence = 0;
  return createEntitlementService({
    idFactory: () => `ent-${++sequence}`,
    clock: () => at,
    assertTenantOperational: () => true,
  });
}

test("creates deeply immutable entitlement snapshots", () => {
  const value = snapshot({
    metadata: { source: { event: "checkout.completed" } },
  });
  assert.equal(value.planId, "developer");
  assert.throws(() => {
    value.metadata.source.event = "changed";
  }, TypeError);
  assert.throws(() => {
    value.entitlements[0].value = 9;
  }, TypeError);
});

test("repository enforces sequential append-only revisions and idempotency", () => {
  const repository = createMemoryEntitlementRepository();
  assert.equal(repository.append(snapshot()).appended, true);
  const duplicate = repository.append(
    snapshot({ id: "ent-duplicate", sourceEventId: "evt-1" }),
  );
  assert.equal(duplicate.appended, false);
  assert.equal(duplicate.duplicateOf, "ent-1");

  assert.throws(
    () =>
      repository.append(
        snapshot({
          id: "ent-3",
          revision: 3,
          sourceEventId: "evt-3",
          previousSnapshotId: "ent-1",
        }),
      ),
    (error) => error.code === "invalid_entitlement_revision",
  );
});

test("materializes catalog rights and emits one auditable event", () => {
  const instance = service();
  const result = instance.materialize({
    tenantId: "tenant-1",
    subscriptionId: "sub-1",
    product: product(),
    plan: plan(),
    sourceEventId: "checkout-1",
    startsAt: at,
  });
  assert.equal(result.snapshot.status, "active");
  assert.deepEqual(result.snapshot.apiIds, [
    "catalog",
    "identity",
    "projects",
  ]);
  assert.equal(result.snapshot.entitlements[0].value, 3);
  assert.equal(result.snapshot.meters[0].includedUnits, 10000);
  assert.equal(result.events[0].type, "entitlement.materialized");
});

test("access decisions enforce APIs and numeric capabilities", () => {
  const instance = service();
  instance.materialize({
    tenantId: "tenant-1",
    subscriptionId: "sub-1",
    product: product(),
    plan: plan(),
    sourceEventId: "checkout-1",
    startsAt: at,
  });

  const allowed = instance.assertAccess({
    subscriptionId: "sub-1",
    apiId: "projects",
    entitlementKey: "projects.max",
    requested: 3,
    at,
  });
  assert.equal(allowed.allowed, true);

  assert.throws(
    () =>
      instance.assertAccess({
        subscriptionId: "sub-1",
        apiId: "billing",
        at,
      }),
    (error) => error.code === "api_not_entitled",
  );
  assert.throws(
    () =>
      instance.assertAccess({
        subscriptionId: "sub-1",
        entitlementKey: "projects.max",
        requested: 4,
        at,
      }),
    (error) => error.code === "entitlement_value_exceeded",
  );
});

test("suspension revokes rights and reactivation rematerializes catalog", () => {
  const instance = service();
  instance.materialize({
    tenantId: "tenant-1",
    subscriptionId: "sub-1",
    product: product(),
    plan: plan(),
    sourceEventId: "checkout-1",
    startsAt: "2026-07-20T18:00:00.000Z",
  });
  const suspended = instance.suspend({
    subscriptionId: "sub-1",
    sourceEventId: "delinquency-1",
    reason: "payment_overdue",
    effectiveAt: at,
  });
  assert.equal(suspended.snapshot.status, "suspended");
  assert.equal(suspended.snapshot.apiIds.length, 0);
  assert.throws(
    () => instance.assertAccess({ subscriptionId: "sub-1", at }),
    (error) => error.code === "entitlement_not_active",
  );

  const reactivated = instance.reactivate({
    subscriptionId: "sub-1",
    product: product(),
    plan: plan(),
    sourceEventId: "payment-recovered-1",
    effectiveAt: "2026-07-20T20:00:00.000Z",
  });
  assert.equal(reactivated.snapshot.status, "active");
  assert.equal(reactivated.snapshot.apiIds.length, 3);
  assert.equal(reactivated.events[0].type, "entitlement.reactivated");
});

test("plan changes create a new revision and preserve history", () => {
  let sequence = 0;
  const instance = createEntitlementService({
    idFactory: () => `ent-${++sequence}`,
    clock: () => at,
  });
  instance.materialize({
    tenantId: "tenant-1",
    subscriptionId: "sub-1",
    product: product(),
    plan: plan(),
    sourceEventId: "checkout-1",
    startsAt: "2026-07-20T18:00:00.000Z",
  });

  const changed = instance.changePlan({
    subscriptionId: "sub-1",
    product: product(),
    plan: plan({
      id: "team",
      version: 2,
      entitlements: [{ key: "projects.max", value: 20 }],
    }),
    sourceEventId: "subscription-upgraded-1",
    effectiveAt: at,
  });
  assert.equal(changed.snapshot.revision, 2);
  assert.equal(changed.snapshot.planId, "team");
  assert.equal(changed.events[0].data.previousPlanId, "developer");
  assert.deepEqual(
    instance.listHistory("sub-1").map(({ planId }) => planId),
    ["developer", "team"],
  );
});

test("cancellation creates a terminal revision with all rights revoked", () => {
  const instance = service();
  instance.materialize({
    tenantId: "tenant-1",
    subscriptionId: "sub-1",
    product: product(),
    plan: plan(),
    sourceEventId: "checkout-1",
    startsAt: "2026-07-20T18:00:00.000Z",
  });
  const cancelled = instance.cancel({
    subscriptionId: "sub-1",
    sourceEventId: "subscription-cancelled-1",
    effectiveAt: at,
  });
  assert.equal(cancelled.snapshot.status, "cancelled");
  assert.deepEqual(cancelled.snapshot.entitlements, []);
  assert.deepEqual(cancelled.snapshot.apiIds, []);
  assert.equal(cancelled.events[0].type, "entitlement.cancelled");
});

test("effective windows are semi-open and support scheduled revisions", () => {
  const repository = createMemoryEntitlementRepository({
    initialSnapshots: [
      snapshot({
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: "2026-08-01T00:00:00.000Z",
      }),
      snapshot({
        id: "ent-2",
        revision: 2,
        planId: "team",
        planVersion: 2,
        sourceEventId: "evt-2",
        previousSnapshotId: "ent-1",
        effectiveFrom: "2026-08-01T00:00:00.000Z",
      }),
    ],
  });
  assert.equal(
    repository.getCurrentBySubscription(
      "sub-1",
      "2026-07-31T23:59:59.999Z",
    ).planId,
    "developer",
  );
  assert.equal(
    repository.getCurrentBySubscription(
      "sub-1",
      "2026-08-01T00:00:00.000Z",
    ).planId,
    "team",
  );
  assert.equal(
    isSnapshotEffective(
      snapshot({
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: "2026-08-01T00:00:00.000Z",
      }),
      "2026-08-01T00:00:00.000Z",
    ),
    false,
  );
});

test("catalog mismatches fail closed", () => {
  const instance = service();
  assert.throws(
    () =>
      instance.materialize({
        tenantId: "tenant-1",
        subscriptionId: "sub-1",
        product: product({ status: "SPECIFIED" }),
        plan: plan(),
        sourceEventId: "checkout-1",
        startsAt: at,
      }),
    (error) =>
      error instanceof EntitlementDomainError &&
      error.code === "product_not_sellable",
  );
});
