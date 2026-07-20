export class UsageDomainError extends Error {
  constructor(code, message, { details = {}, cause } = {}) {
    super(message, { cause });
    this.name = "UsageDomainError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function required(value, name) {
  const result = String(value ?? "").trim();
  if (!result) throw new UsageDomainError("invalid_argument", `${name} is required`);
  return result;
}

function iso(value, name) {
  const result = required(value, name);
  if (Number.isNaN(Date.parse(result))) {
    throw new UsageDomainError("invalid_argument", `${name} must be an ISO date`);
  }
  return result;
}

function nonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new UsageDomainError("invalid_argument", `${name} must be a non-negative safe integer`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function immutable(value) {
  return deepFreeze(structuredClone(value));
}

export function createUsageEvent({
  id,
  idempotencyKey,
  tenantId,
  projectId,
  apiKeyId = null,
  apiId,
  operation,
  quantity = 1,
  occurredAt,
  metadata = {},
}) {
  return immutable({
    id: required(id, "id"),
    idempotencyKey: required(idempotencyKey, "idempotencyKey"),
    tenantId: required(tenantId, "tenantId"),
    projectId: required(projectId, "projectId"),
    apiKeyId: apiKeyId === null ? null : required(apiKeyId, "apiKeyId"),
    apiId: required(apiId, "apiId"),
    operation: required(operation, "operation"),
    quantity: nonNegativeInteger(quantity, "quantity"),
    occurredAt: iso(occurredAt, "occurredAt"),
    metadata,
  });
}

export function createUsageWindow({ from, to }) {
  const normalized = immutable({ from: iso(from, "from"), to: iso(to, "to") });
  if (Date.parse(normalized.from) >= Date.parse(normalized.to)) {
    throw new UsageDomainError("invalid_usage_window", "usage window must have from before to");
  }
  return normalized;
}

export function createMemoryUsageRepository({ initialEvents = [] } = {}) {
  const byId = new Map();
  const byIdempotencyKey = new Map();

  function append(input) {
    const event = createUsageEvent(input);
    if (byId.has(event.id)) {
      throw new UsageDomainError("usage_event_id_conflict", "usage event id already exists");
    }
    const existingId = byIdempotencyKey.get(event.idempotencyKey);
    if (existingId) {
      return immutable({
        event: byId.get(existingId),
        appended: false,
        duplicateOf: existingId,
      });
    }
    byId.set(event.id, event);
    byIdempotencyKey.set(event.idempotencyKey, event.id);
    return immutable({ event, appended: true, duplicateOf: null });
  }

  for (const event of initialEvents) append(event);

  function list({
    tenantId,
    projectId,
    apiKeyId,
    apiId,
    operation,
    from,
    to,
  } = {}) {
    const fromMs = from === undefined ? -Infinity : Date.parse(iso(from, "from"));
    const toMs = to === undefined ? Infinity : Date.parse(iso(to, "to"));
    return [...byId.values()]
      .filter((event) => tenantId === undefined || event.tenantId === tenantId)
      .filter((event) => projectId === undefined || event.projectId === projectId)
      .filter((event) => apiKeyId === undefined || event.apiKeyId === apiKeyId)
      .filter((event) => apiId === undefined || event.apiId === apiId)
      .filter((event) => operation === undefined || event.operation === operation)
      .filter((event) => {
        const at = Date.parse(event.occurredAt);
        return at >= fromMs && at < toMs;
      })
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
      .map(immutable);
  }

  return Object.freeze({
    kind: "memory",
    append,
    getById(id) {
      const event = byId.get(required(id, "eventId"));
      return event ? immutable(event) : null;
    },
    getByIdempotencyKey(key) {
      const id = byIdempotencyKey.get(required(key, "idempotencyKey"));
      return id ? immutable(byId.get(id)) : null;
    },
    list,
  });
}

function assertRepository(repository) {
  for (const method of ["append", "getById", "getByIdempotencyKey", "list"]) {
    if (typeof repository?.[method] !== "function") {
      throw new UsageDomainError("invalid_repository", `repository.${method} must be a function`);
    }
  }
  return repository;
}

export function aggregateUsage(events, { groupBy = ["tenantId", "projectId", "apiId", "operation"] } = {}) {
  const allowed = new Set(["tenantId", "projectId", "apiKeyId", "apiId", "operation"]);
  for (const field of groupBy) {
    if (!allowed.has(field)) {
      throw new UsageDomainError("invalid_group_by", `unsupported usage aggregation field: ${field}`);
    }
  }
  const buckets = new Map();
  for (const input of events) {
    const event = createUsageEvent(input);
    const dimensions = Object.fromEntries(groupBy.map((field) => [field, event[field]]));
    const key = JSON.stringify(dimensions);
    const current = buckets.get(key) ?? { dimensions, quantity: 0, eventCount: 0 };
    current.quantity += event.quantity;
    current.eventCount += 1;
    buckets.set(key, current);
  }
  return [...buckets.values()]
    .sort((a, b) => JSON.stringify(a.dimensions).localeCompare(JSON.stringify(b.dimensions)))
    .map(immutable);
}

export function createUsageService({
  repository = createMemoryUsageRepository(),
  idFactory,
  clock = () => new Date().toISOString(),
  assertTenantOperational = () => true,
  assertProjectOperational = () => true,
} = {}) {
  const events = assertRepository(repository);
  if (typeof idFactory !== "function") {
    throw new UsageDomainError("invalid_argument", "idFactory must be a function");
  }
  if (typeof assertTenantOperational !== "function" || typeof assertProjectOperational !== "function") {
    throw new UsageDomainError("invalid_argument", "usage guards must be functions");
  }

  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",
    recordUsage({
      idempotencyKey,
      tenantId,
      projectId,
      apiKeyId = null,
      apiId,
      operation,
      quantity = 1,
      occurredAt = clock(),
      metadata = {},
    }) {
      const normalizedTenantId = required(tenantId, "tenantId");
      const normalizedProjectId = required(projectId, "projectId");
      assertTenantOperational(normalizedTenantId);
      assertProjectOperational(normalizedProjectId, normalizedTenantId);
      const result = events.append(createUsageEvent({
        id: required(idFactory(), "idFactory result"),
        idempotencyKey,
        tenantId: normalizedTenantId,
        projectId: normalizedProjectId,
        apiKeyId,
        apiId,
        operation,
        quantity,
        occurredAt,
        metadata,
      }));
      return immutable({
        ...result,
        domainEvents: result.appended ? [{
          type: "usage.recorded",
          usageEventId: result.event.id,
          tenantId: result.event.tenantId,
          projectId: result.event.projectId,
          occurredAt: result.event.occurredAt,
          data: {
            apiId: result.event.apiId,
            operation: result.event.operation,
            quantity: result.event.quantity,
          },
        }] : [],
      });
    },
    queryUsage(filters = {}) {
      return events.list(filters);
    },
    summarizeUsage({ window, filters = {}, groupBy } = {}) {
      const normalizedWindow = createUsageWindow(window);
      const matching = events.list({
        ...filters,
        from: normalizedWindow.from,
        to: normalizedWindow.to,
      });
      return immutable({
        window: normalizedWindow,
        totals: aggregateUsage(matching, { groupBy }),
        eventCount: matching.length,
        quantity: matching.reduce((sum, event) => sum + event.quantity, 0),
      });
    },
  });
}
