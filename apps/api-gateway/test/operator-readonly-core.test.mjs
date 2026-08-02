import assert from "node:assert/strict";
import test from "node:test";

import {
  OperatorReadonlyError,
  createOperatorReadonlyCore,
  createUnavailableOperatorReadonlyAdapters,
} from "../src/operator-readonly-core.mjs";

const CONTEXT = Object.freeze({
  institution: "API Developers.digital",
  tenant: "uni.",
  operator: "operator-igor",
  correlationId: "corr_wave1_001",
});

const TARGET = Object.freeze({
  provider: "github",
  resourceType: "repository",
});

function auditRecorder({ fail = false } = {}) {
  const events = [];
  return {
    events,
    async recordOperatorCapabilityResult(event) {
      events.push(event);
      if (fail) throw new Error("audit unavailable");
      return { eventId: `audit-${events.length}` };
    },
  };
}

function createCore(adapters, audit = auditRecorder()) {
  return {
    core: createOperatorReadonlyCore({
      adapters,
      auditRecorder: audit,
      now: () => "2026-08-01T22:00:00.000Z",
    }),
    audit,
  };
}

test("null adapters fail closed and record sanitized failure", async () => {
  const audit = auditRecorder();
  const core = createOperatorReadonlyCore({
    adapters: createUnavailableOperatorReadonlyAdapters(),
    auditRecorder: audit,
  });

  await assert.rejects(
    core.operatorStatus({ context: CONTEXT, target: TARGET }),
    (error) =>
      error instanceof OperatorReadonlyError &&
      error.code === "adapter_unavailable",
  );

  assert.equal(audit.events.length, 1);
  assert.equal(audit.events[0].outcome, "failure");
  assert.equal(audit.events[0].metadata.errorCode, "adapter_unavailable");
  assert.equal("content" in audit.events[0].metadata, false);
});

test("operatorStatus returns bounded metadata and forces no-data flags", async () => {
  const calls = [];
  const { core, audit } = createCore({
    async status(request) {
      calls.push(request);
      return {
        items: [
          {
            resourceId: "repo-1",
            kind: "repository",
            state: "online",
            checkedAt: "2026-08-01T21:55:00.000Z",
            message: "reachable",
          },
        ],
      };
    },
    async inventory() {
      throw new Error("unused");
    },
    async read() {
      throw new Error("unused");
    },
    async audit() {
      throw new Error("unused");
    },
  });

  const result = await core.operatorStatus({
    context: CONTEXT,
    target: TARGET,
    limit: 10,
  });

  assert.equal(result.operationId, "operatorStatus");
  assert.equal(result.productionChanged, false);
  assert.equal(result.contentReturned, false);
  assert.equal(result.rowsReturned, false);
  assert.equal(result.valuesReturned, false);
  assert.equal(result.items.length, 1);
  assert.equal(calls[0].includeContent, false);
  assert.equal(calls[0].includeRows, false);
  assert.equal(calls[0].includeValues, false);
  assert.equal(audit.events[0].metadata.itemCount, 1);
});

test("operatorInventory rejects unknown or data-bearing provider fields", async () => {
  for (const providerResult of [
    {
      items: [
        {
          resourceId: "repo-1",
          kind: "repository",
          name: "platform",
          status: "online",
          capabilities: [],
          content: "forbidden",
        },
      ],
    },
    {
      items: [],
      rows: [],
    },
  ]) {
    const { core } = createCore({
      async status() {
        throw new Error("unused");
      },
      async inventory() {
        return providerResult;
      },
      async read() {
        throw new Error("unused");
      },
      async audit() {
        throw new Error("unused");
      },
    });

    await assert.rejects(
      core.operatorInventory({ context: CONTEXT, target: TARGET }),
      (error) =>
        error instanceof OperatorReadonlyError &&
        [
          "provider_returned_sensitive_data",
          "provider_contract_violation",
        ].includes(error.code),
    );
  }
});

test("operatorRead returns only requested safe primitive projection", async () => {
  const { core } = createCore({
    async status() {
      throw new Error("unused");
    },
    async inventory() {
      throw new Error("unused");
    },
    async read(request) {
      assert.deepEqual(request.fields, ["name", "status", "version"]);
      return {
        resource: {
          id: "repo-1",
          kind: "repository",
          observedAt: "2026-08-01T21:58:00.000Z",
          projection: {
            name: "apidevelopers-platform",
            status: "online",
            version: 108,
          },
        },
      };
    },
    async audit() {
      throw new Error("unused");
    },
  });

  const result = await core.operatorRead({
    context: CONTEXT,
    target: { ...TARGET, resourceId: "repo-1" },
    fields: ["name", "status", "version"],
  });

  assert.deepEqual(result.resource.projection, {
    name: "apidevelopers-platform",
    status: "online",
    version: 108,
  });
});

test("operatorRead rejects unrequested, nested and sensitive projection fields", async () => {
  const variants = [
    {
      resource: {
        id: "repo-1",
        kind: "repository",
        observedAt: "2026-08-01T21:58:00.000Z",
        projection: { name: "platform", owner: "unexpected" },
      },
    },
    {
      resource: {
        id: "repo-1",
        kind: "repository",
        observedAt: "2026-08-01T21:58:00.000Z",
        projection: { name: { nested: true } },
      },
    },
    {
      resource: {
        id: "repo-1",
        kind: "repository",
        observedAt: "2026-08-01T21:58:00.000Z",
        projection: { token: "forbidden" },
      },
    },
  ];

  for (const value of variants) {
    const { core } = createCore({
      async status() {
        throw new Error("unused");
      },
      async inventory() {
        throw new Error("unused");
      },
      async read() {
        return value;
      },
      async audit() {
        throw new Error("unused");
      },
    });

    await assert.rejects(
      core.operatorRead({
        context: CONTEXT,
        target: { ...TARGET, resourceId: "repo-1" },
        fields: value.resource.projection.token
          ? ["name"]
          : ["name"],
      }),
      (error) => error instanceof OperatorReadonlyError,
    );
  }
});

test("operatorAudit exposes event envelope without metadata or payload", async () => {
  const { core } = createCore({
    async status() {
      throw new Error("unused");
    },
    async inventory() {
      throw new Error("unused");
    },
    async read() {
      throw new Error("unused");
    },
    async audit() {
      return {
        events: [
          {
            eventId: "evt-1",
            action: "operator.readonly.status",
            resource: "github:repository",
            outcome: "success",
            occurredAt: "2026-08-01T21:59:00.000Z",
            correlationId: "corr_previous",
          },
        ],
      };
    },
  });

  const result = await core.operatorAudit({
    context: CONTEXT,
    target: { provider: "gateway", resourceType: "audit-event" },
    limit: 20,
  });

  assert.deepEqual(Object.keys(result.events[0]).sort(), [
    "action",
    "correlationId",
    "eventId",
    "occurredAt",
    "outcome",
    "resource",
  ]);
});

test("audit persistence failure blocks a successful read", async () => {
  const { core } = createCore(
    {
      async status() {
        return { items: [] };
      },
      async inventory() {
        throw new Error("unused");
      },
      async read() {
        throw new Error("unused");
      },
      async audit() {
        throw new Error("unused");
      },
    },
    auditRecorder({ fail: true }),
  );

  await assert.rejects(
    core.operatorStatus({ context: CONTEXT, target: TARGET }),
    (error) =>
      error instanceof OperatorReadonlyError &&
      error.code === "audit_unavailable",
  );
});

test("invalid context, traversal and non-allowlisted read fields are rejected", async () => {
  const { core } = createCore(createUnavailableOperatorReadonlyAdapters());

  await assert.rejects(
    core.operatorStatus({
      context: { ...CONTEXT, correlationId: "../secret" },
      target: TARGET,
    }),
    (error) =>
      error instanceof OperatorReadonlyError &&
      error.code === "invalid_request",
  );

  assert.throws(
    () =>
      core.operatorRead({
        context: CONTEXT,
        target: { ...TARGET, resourceId: "repo-1" },
        fields: ["content"],
      }),
    (error) =>
      error instanceof OperatorReadonlyError &&
      error.code === "field_not_allowed",
  );
});
