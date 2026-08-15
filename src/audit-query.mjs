const COLLECTION = "global_trust_audit_events";

function optionalText(value, name) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  return value;
}

function boundedLimit(value) {
  if (value === undefined || value === null || value === "") return 50;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
    throw new RangeError("limit must be an integer between 1 and 200");
  }
  return parsed;
}

export function createGlobalTrustAuditQueryService({ store } = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction must be a function");
  }

  return Object.freeze({
    async listTenantEvents({
      tenantId,
      correlationId,
      action,
      actorId,
      from,
      to,
      limit,
    } = {}) {
      const requiredTenantId = optionalText(tenantId, "tenantId");
      if (!requiredTenantId) throw new TypeError("tenantId is required");

      const filters = {
        correlationId: optionalText(correlationId, "correlationId"),
        action: optionalText(action, "action"),
        actorId: optionalText(actorId, "actorId"),
        from: optionalText(from, "from"),
        to: optionalText(to, "to"),
        limit: boundedLimit(limit),
      };

      const result = await store.transaction((tx) => tx.list(COLLECTION));
      return result.result
        .map(({ value }) => value)
        .filter((event) => event.tenantId === requiredTenantId)
        .filter((event) => !filters.correlationId || event.correlationId === filters.correlationId)
        .filter((event) => !filters.action || event.action === filters.action)
        .filter((event) => !filters.actorId || event.actorId === filters.actorId)
        .filter((event) => !filters.from || event.occurredAt >= filters.from)
        .filter((event) => !filters.to || event.occurredAt <= filters.to)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, filters.limit);
    },
  });
}
