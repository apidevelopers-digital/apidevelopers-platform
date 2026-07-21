import assert from "node:assert/strict";
import test from "node:test";
import { GatewayDomainError } from "../src/index.mjs";
import { T0, authorize, fixture } from "./helpers.mjs";

test("authorizes through entitlement then limits", () => {
  const f = fixture();
  const result = authorize(f.service);
  assert.equal(result.snapshot.status, "authorized");
  assert.equal(result.events.map((item) => item.type).join(","), "gateway.requested,gateway.authorized");
  assert.equal(f.entitlementCalls.length, 1);
  assert.equal(f.limitCalls.length, 1);
  assert.equal(f.usageCount(), 0);
  assert.equal(f.entitlementCalls[0].subscriptionId, "subscription-1");
  assert.equal(f.limitCalls[0].tenantId, "tenant-1");
});

test("blocks when entitlement denies and never evaluates limits", () => {
  const f = fixture({
    entitlementError: new GatewayDomainError("api_not_entitled", "API is not entitled"),
  });
  const result = authorize(f.service);
  assert.equal(result.snapshot.status, "blocked");
  assert.equal(result.snapshot.block.source, "entitlement");
  assert.equal(f.limitCalls.length, 0);
  assert.equal(f.usageCount(), 0);
});

test("blocks hard limits and never records usage", () => {
  const f = fixture({ limitAllowed: false });
  const result = authorize(f.service);
  assert.equal(result.snapshot.status, "blocked");
  assert.equal(result.snapshot.block.code, "limit_blocked");
  assert.equal(f.usageCount(), 0);
});

test("records usage only after successful completion", () => {
  const f = fixture();
  authorize(f.service);
  const completed = f.service.complete({
    requestId: "request-1",
    idempotencyKey: "usage-for-request-1",
    occurredAt: T0,
    metadata: { upstreamStatus: 200 },
  });
  assert.equal(completed.snapshot.status, "completed");
  assert.equal(completed.snapshot.usageEventId, "usage-1");
  assert.equal(f.usageCount(), 1);
  assert.equal(f.usageCallsList[0].apiKeyId, "apikey-1");
  assert.equal(f.usageCallsList[0].quantity, 1);
});

test("failed upstream requests do not record usage", () => {
  const f = fixture();
  authorize(f.service);
  const failed = f.service.fail({
    requestId: "request-1",
    idempotencyKey: "failure-request-1",
    code: "upstream_timeout",
    message: "upstream timed out",
  });
  assert.equal(failed.snapshot.status, "failed");
  assert.equal(f.usageCount(), 0);
});

test("authorization is idempotent by request key", () => {
  const f = fixture();
  const first = authorize(f.service);
  const repeated = authorize(f.service, { requestId: "request-2" });
  assert.equal(first.snapshot.status, "authorized");
  assert.equal(repeated.appended, false);
  assert.equal(repeated.snapshot.requestId, "request-1");
  assert.equal(f.entitlementCalls.length, 1);
  assert.equal(f.limitCalls.length, 1);
});

test("terminal completion is idempotent and cannot double-count usage", () => {
  const f = fixture();
  authorize(f.service);
  const first = f.service.complete({
    requestId: "request-1",
    idempotencyKey: "usage-for-request-1",
    occurredAt: T0,
  });
  const repeated = f.service.complete({
    requestId: "request-1",
    idempotencyKey: "usage-for-request-1-repeat",
    occurredAt: T0,
  });
  assert.equal(first.snapshot.status, "completed");
  assert.equal(repeated.appended, false);
  assert.equal(f.usageCount(), 1);
});

test("history preserves requested, authorized and completed revisions", () => {
  const f = fixture();
  authorize(f.service);
  f.service.complete({
    requestId: "request-1",
    idempotencyKey: "usage-for-request-1",
    occurredAt: T0,
  });
  const history = f.service.listHistory("request-1");
  assert.deepEqual(history.map((item) => item.status), ["requested", "authorized", "completed"]);
  assert.deepEqual(history.map((item) => item.revision), [1, 2, 3]);
});
