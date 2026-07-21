import assert from "node:assert/strict";
import test from "node:test";
import {
  createGatewayRequest,
  createMemoryGatewayRepository,
} from "../src/index.mjs";
import { T0, principal } from "./helpers.mjs";

function requested(patch = {}) {
  return createGatewayRequest({
    requestId: "request-1",
    revision: 1,
    idempotencyKey: "idem-1",
    principal: principal(),
    apiId: "payments",
    operation: "charges.create",
    entitlementKey: "payments.write",
    metric: "requests",
    quantity: 1,
    status: "requested",
    entitlement: null,
    limit: null,
    usageEventId: null,
    block: null,
    failure: null,
    previousSnapshotId: null,
    snapshotId: "snapshot-1",
    requestedAt: T0,
    updatedAt: T0,
    completedAt: null,
    metadata: {},
    ...patch,
  });
}

test("creates immutable requests and blocks sensitive metadata", () => {
  const snapshot = requested({ metadata: { trace: { id: "trace-1" } } });
  assert.throws(() => {
    snapshot.metadata.trace.id = "changed";
  }, TypeError);
  assert.throws(
    () => requested({ metadata: { authorization: "forbidden" } }),
    (error) => error.code === "sensitive_data_forbidden",
  );
});

test("requires active public API key identity", () => {
  assert.throws(
    () => requested({ principal: principal({ apiKeyStatus: "revoked" }) }),
    (error) => error.code === "api_key_not_active",
  );
});

test("repository is append-only, sequential and idempotent", () => {
  const repository = createMemoryGatewayRepository();
  const first = requested();
  assert.equal(repository.append(first).appended, true);
  const duplicate = repository.append({ ...first, snapshotId: "snapshot-other" });
  assert.equal(duplicate.appended, false);
  assert.equal(duplicate.snapshot.requestId, "request-1");
  assert.throws(
    () =>
      repository.append({
        ...first,
        snapshotId: "snapshot-3",
        idempotencyKey: "idem-2",
        revision: 3,
        previousSnapshotId: "snapshot-1",
      }),
    (error) => error.code === "invalid_gateway_revision",
  );
});
