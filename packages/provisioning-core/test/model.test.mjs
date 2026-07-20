import assert from "node:assert/strict";
import test from "node:test";
import {
  createProvisioningSnapshot,
} from "../src/index.mjs";
import {
  T0,
  request,
  service,
  subscription,
} from "./helpers.mjs";

test("creates immutable snapshots and rejects sensitive metadata", () => {
  const snapshot = createProvisioningSnapshot({
    snapshotId: "snap-1",
    provisioningId: "prov-1",
    revision: 1,
    subscriptionId: "sub-1",
    accountId: "account-1",
    ownerUserId: "user-1",
    productId: "platform-core",
    productVersion: 1,
    planId: "developer",
    planVersion: 1,
    status: "requested",
    attempt: 0,
    currentStep: "tenant",
    tenant: { status: "pending", id: null, name: "Acme", slug: "acme" },
    project: {
      status: "pending",
      id: null,
      name: "Production",
      slug: "production",
    },
    apikey: { status: "pending", id: null, prefix: null },
    failure: null,
    compensation: [],
    sourceEventId: "event-1",
    previousSnapshotId: null,
    createdAt: T0,
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

test("requires an active subscription", () => {
  assert.throws(
    () =>
      request(service(), {
        subscription: subscription({ status: "pending" }),
      }),
    (error) => error.code === "subscription_not_active",
  );
});

test("creates one idempotent provisioning intent per subscription", () => {
  const s = service();
  const first = request(s);
  const repeated = request(s, {
    provisioningId: "prov-2",
    sourceEventId: "subscription-activated-2",
  });
  assert.equal(first.snapshot.status, "requested");
  assert.equal(repeated.appended, false);
  assert.equal(repeated.snapshot.provisioningId, "prov-1");
  assert.throws(
    () =>
      request(s, {
        provisioningId: "prov-3",
        accountId: "account-2",
        sourceEventId: "subscription-activated-3",
      }),
    (error) => error.code === "subscription_provisioning_conflict",
  );
});
