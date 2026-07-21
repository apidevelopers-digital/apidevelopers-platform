import { randomUUID } from "node:crypto";

function assertPlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new TypeError("execution plan must be an object");
  }
  if (!Array.isArray(plan.capabilities)) {
    throw new TypeError("execution plan capabilities must be an array");
  }
}

function normalizeHandlers(handlers) {
  if (handlers instanceof Map) return handlers;
  if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) {
    throw new TypeError("handlers must be a Map or object");
  }
  return new Map(Object.entries(handlers));
}

function toErrorDetails(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: "Error",
    message: String(error),
  };
}

export async function executeCapabilityPlan(plan, {
  handlers,
  context = {},
  emit = async () => {},
  clock = () => new Date(),
  stopOnError = true,
} = {}) {
  assertPlan(plan);
  const handlerMap = normalizeHandlers(handlers);

  if (typeof emit !== "function") {
    throw new TypeError("emit must be a function");
  }
  if (typeof clock !== "function") {
    throw new TypeError("clock must be a function");
  }

  const runId = randomUUID();
  const startedAt = clock().toISOString();
  const results = [];

  await emit({
    type: "operator.run.started.v1",
    runId,
    startedAt,
    capabilityCount: plan.capabilities.length,
    requested: [...(plan.requested ?? [])],
  });

  for (const capability of plan.capabilities) {
    const capabilityId = capability?.id;
    if (typeof capabilityId !== "string" || capabilityId.trim() === "") {
      throw new TypeError("plan capability id must be a non-empty string");
    }

    const handler = handlerMap.get(capabilityId);
    const capabilityStartedAt = clock().toISOString();

    await emit({
      type: "operator.capability.started.v1",
      runId,
      capabilityId,
      startedAt: capabilityStartedAt,
    });

    if (typeof handler !== "function") {
      const error = new Error(`no handler registered for capability: ${capabilityId}`);
      const failed = {
        capabilityId,
        status: "failed",
        startedAt: capabilityStartedAt,
        finishedAt: clock().toISOString(),
        error: toErrorDetails(error),
      };
      results.push(failed);

      await emit({
        type: "operator.capability.failed.v1",
        runId,
        ...failed,
      });

      if (stopOnError) {
        await emit({
          type: "operator.run.failed.v1",
          runId,
          startedAt,
          finishedAt: clock().toISOString(),
          results,
        });
        return Object.freeze({
          schemaVersion: 1,
          runId,
          status: "failed",
          startedAt,
          finishedAt: clock().toISOString(),
          results: Object.freeze([...results]),
        });
      }
      continue;
    }

    try {
      const output = await handler({
        runId,
        capability,
        context,
      });

      const completed = {
        capabilityId,
        status: "completed",
        startedAt: capabilityStartedAt,
        finishedAt: clock().toISOString(),
        output: output ?? null,
      };
      results.push(completed);

      await emit({
        type: "operator.capability.completed.v1",
        runId,
        ...completed,
      });
    } catch (error) {
      const failed = {
        capabilityId,
        status: "failed",
        startedAt: capabilityStartedAt,
        finishedAt: clock().toISOString(),
        error: toErrorDetails(error),
      };
      results.push(failed);

      await emit({
        type: "operator.capability.failed.v1",
        runId,
        ...failed,
      });

      if (stopOnError) {
        const finishedAt = clock().toISOString();
        await emit({
          type: "operator.run.failed.v1",
          runId,
          startedAt,
          finishedAt,
          results,
        });
        return Object.freeze({
          schemaVersion: 1,
          runId,
          status: "failed",
          startedAt,
          finishedAt,
          results: Object.freeze([...results]),
        });
      }
    }
  }

  const failed = results.some((result) => result.status === "failed");
  const finishedAt = clock().toISOString();
  const status = failed ? "completed_with_errors" : "completed";
  const eventType = failed ? "operator.run.completed_with_errors.v1" : "operator.run.completed.v1";

  await emit({
    type: eventType,
    runId,
    startedAt,
    finishedAt,
    results,
  });

  return Object.freeze({
    schemaVersion: 1,
    runId,
    status,
    startedAt,
    finishedAt,
    results: Object.freeze([...results]),
  });
}
