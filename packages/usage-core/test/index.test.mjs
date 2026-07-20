import assert from "node:assert/strict";
import test from "node:test";
import {
  UsageDomainError,
  aggregateUsage,
  createMemoryUsageRepository,
  createUsageEvent,
  createUsageService,
  createUsageWindow,
} from "../src/index.mjs";

const at = "2026-07-20T12:00:00.000Z";
const sample = (overrides = {}) => createUsageEvent({
  id: "usage-1",
  idempotencyKey: "request-1",
  tenantId: "tenant-1",
  projectId: "project-1",
  apiKeyId: "key-1",
  apiId: "cpf-api",
  operation: "consult",
  quantity: 1,
  occurredAt: at,
  metadata: { trace: { id: "trace-1" } },
  ...overrides,
});

test("creates deeply immutable usage events", () => {
  const event = sample();
  assert.equal(event.operation, "consult");
  assert.throws(() => { event.metadata.trace.id = "changed"; }, TypeError);
});

test("rejects invalid quantity and windows", () => {
  assert.throws(() => sample({ quantity: -1 }), (error) => error.code === "invalid_argument");
  assert.throws(
    () => createUsageWindow({ from: at, to: at }),
    (error) => error instanceof UsageDomainError && error.code === "invalid_usage_window",
  );
});

test("repository appends idempotently", () => {
  const repository = createMemoryUsageRepository();
  assert.equal(repository.append(sample()).appended, true);
  const duplicate = repository.append(sample({ id: "usage-2" }));
  assert.equal(duplicate.appended, false);
  assert.equal(duplicate.duplicateOf, "usage-1");
  assert.equal(repository.list().length, 1);
});

test("repository rejects duplicate ids with different idempotency keys", () => {
  const repository = createMemoryUsageRepository();
  repository.append(sample());
  assert.throws(
    () => repository.append(sample({ idempotencyKey: "request-2" })),
    (error) => error.code === "usage_event_id_conflict",
  );
});

test("aggregates usage by selected dimensions", () => {
  const totals = aggregateUsage([
    sample(),
    sample({ id: "usage-2", idempotencyKey: "request-2", quantity: 3 }),
    sample({ id: "usage-3", idempotencyKey: "request-3", operation: "status", quantity: 2 }),
  ], { groupBy: ["operation"] });
  assert.deepEqual(totals, [
    { dimensions: { operation: "consult" }, quantity: 4, eventCount: 2 },
    { dimensions: { operation: "status" }, quantity: 2, eventCount: 1 },
  ]);
});

test("service validates ownership guards and emits only once", () => {
  let sequence = 0;
  const checked = [];
  const service = createUsageService({
    idFactory: () => `usage-${++sequence}`,
    clock: () => at,
    assertTenantOperational: (tenantId) => checked.push(["tenant", tenantId]),
    assertProjectOperational: (projectId, tenantId) => checked.push(["project", projectId, tenantId]),
  });
  const first = service.recordUsage({
    idempotencyKey: "request-1",
    tenantId: "tenant-1",
    projectId: "project-1",
    apiId: "cpf-api",
    operation: "consult",
  });
  const second = service.recordUsage({
    idempotencyKey: "request-1",
    tenantId: "tenant-1",
    projectId: "project-1",
    apiId: "cpf-api",
    operation: "consult",
  });
  assert.equal(first.domainEvents[0].type, "usage.recorded");
  assert.equal(second.domainEvents.length, 0);
  assert.deepEqual(checked, [
    ["tenant", "tenant-1"], ["project", "project-1", "tenant-1"],
    ["tenant", "tenant-1"], ["project", "project-1", "tenant-1"],
  ]);
});

test("service summarizes half-open time windows", () => {
  let sequence = 0;
  const service = createUsageService({ idFactory: () => `usage-${++sequence}` });
  for (const [key, occurredAt, quantity] of [
    ["r1", "2026-07-01T00:00:00.000Z", 2],
    ["r2", "2026-07-31T23:59:59.999Z", 3],
    ["r3", "2026-08-01T00:00:00.000Z", 5],
  ]) {
    service.recordUsage({
      idempotencyKey: key,
      tenantId: "tenant-1",
      projectId: "project-1",
      apiId: "cpf-api",
      operation: "consult",
      occurredAt,
      quantity,
    });
  }
  const summary = service.summarizeUsage({
    window: { from: "2026-07-01T00:00:00.000Z", to: "2026-08-01T00:00:00.000Z" },
    filters: { tenantId: "tenant-1" },
    groupBy: ["apiId", "operation"],
  });
  assert.equal(summary.eventCount, 2);
  assert.equal(summary.quantity, 5);
  assert.equal(summary.totals[0].quantity, 5);
});
