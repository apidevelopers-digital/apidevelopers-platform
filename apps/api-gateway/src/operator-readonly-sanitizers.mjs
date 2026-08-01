import {
  FORBIDDEN_KEYS,
  MAX_ITEMS,
  MAX_STRING,
  SAFE_CAPABILITY,
  OperatorReadonlyError,
  assertNoForbiddenKeys,
  normalizeTimestamp,
  requireExactKeys,
  requireObject,
  requireText,
} from "./operator-readonly-contract.mjs";

function normalizeState(value, name = "state") {
  const normalized = requireText(value, name, /^[a-z_]{2,32}$/);
  if (!new Set(["online", "attention", "offline", "not_configured", "blocked", "unknown"]).has(normalized)) {
    throw new OperatorReadonlyError("provider_contract_violation", `${name} is unsupported`, { field: name });
  }
  return normalized;
}

function optionalMessage(value, name) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim();
  if (!normalized || normalized.length > MAX_STRING || normalized.includes("\0")) {
    throw new OperatorReadonlyError("provider_contract_violation", `${name} is invalid`, { field: name });
  }
  return normalized;
}

export function sanitizeStatusItem(item, index) {
  const value = requireObject(item, `items[${index}]`);
  requireExactKeys(value, new Set(["resourceId", "kind", "state", "checkedAt", "message"]), `items[${index}]`);
  return Object.freeze({
    resourceId: requireText(value.resourceId, `items[${index}].resourceId`),
    kind: requireText(value.kind, `items[${index}].kind`),
    state: normalizeState(value.state, `items[${index}].state`),
    checkedAt: normalizeTimestamp(value.checkedAt, `items[${index}].checkedAt`),
    ...(value.message !== undefined
      ? { message: optionalMessage(value.message, `items[${index}].message`) }
      : {}),
  });
}

export function sanitizeInventoryItem(item, index) {
  const value = requireObject(item, `items[${index}]`);
  requireExactKeys(
    value,
    new Set(["resourceId", "kind", "name", "status", "parentId", "capabilities"]),
    `items[${index}]`,
  );
  const capabilities = value.capabilities ?? [];
  if (!Array.isArray(capabilities) || capabilities.length > 100) {
    throw new OperatorReadonlyError(
      "provider_contract_violation",
      "capabilities must be a bounded array",
      { path: `items[${index}].capabilities` },
    );
  }
  return Object.freeze({
    resourceId: requireText(value.resourceId, `items[${index}].resourceId`),
    kind: requireText(value.kind, `items[${index}].kind`),
    name: requireText(value.name, `items[${index}].name`),
    status: normalizeState(value.status, `items[${index}].status`),
    ...(value.parentId !== undefined
      ? { parentId: requireText(value.parentId, `items[${index}].parentId`) }
      : {}),
    capabilities: Object.freeze([
      ...new Set(
        capabilities.map((capability) =>
          requireText(capability, `items[${index}].capability`, SAFE_CAPABILITY),
        ),
      ),
    ]),
  });
}

function normalizePrimitive(value, path) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new OperatorReadonlyError("provider_contract_violation", "projection number must be finite", { path });
    }
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.length > MAX_STRING || normalized.includes("\0")) {
      throw new OperatorReadonlyError(
        "provider_contract_violation",
        "projection string exceeds safe limits",
        { path },
      );
    }
    return normalized;
  }
  throw new OperatorReadonlyError(
    "provider_contract_violation",
    "projection values must be primitive",
    { path },
  );
}

export function sanitizeReadResource(resource, fields) {
  const value = requireObject(resource, "resource");
  requireExactKeys(value, new Set(["id", "kind", "projection", "observedAt"]), "resource");
  const projection = requireObject(value.projection, "resource.projection");
  const requested = new Set(fields);

  for (const key of Object.keys(projection)) {
    if (!requested.has(key)) {
      throw new OperatorReadonlyError(
        "provider_contract_violation",
        "provider returned an unrequested projection field",
        { path: `resource.projection.${key}` },
      );
    }
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      throw new OperatorReadonlyError(
        "provider_returned_sensitive_data",
        "provider returned a forbidden projection field",
        { path: `resource.projection.${key}` },
      );
    }
  }

  const sanitizedProjection = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(projection, field)) {
      sanitizedProjection[field] = normalizePrimitive(
        projection[field],
        `resource.projection.${field}`,
      );
    }
  }

  return Object.freeze({
    id: requireText(value.id, "resource.id"),
    kind: requireText(value.kind, "resource.kind"),
    observedAt: normalizeTimestamp(value.observedAt, "resource.observedAt"),
    projection: Object.freeze(sanitizedProjection),
  });
}

export function sanitizeAuditEvent(event, index) {
  const value = requireObject(event, `events[${index}]`);
  requireExactKeys(
    value,
    new Set(["eventId", "action", "resource", "outcome", "occurredAt", "correlationId"]),
    `events[${index}]`,
  );
  const outcome = requireText(value.outcome, `events[${index}].outcome`, /^[a-z_]{2,32}$/);
  if (!new Set(["success", "failure", "denied", "blocked"]).has(outcome)) {
    throw new OperatorReadonlyError(
      "provider_contract_violation",
      "audit outcome is unsupported",
      { path: `events[${index}].outcome` },
    );
  }
  return Object.freeze({
    eventId: requireText(value.eventId, `events[${index}].eventId`),
    action: requireText(value.action, `events[${index}].action`),
    resource: requireText(value.resource, `events[${index}].resource`),
    outcome,
    occurredAt: normalizeTimestamp(value.occurredAt, `events[${index}].occurredAt`),
    correlationId: requireText(value.correlationId, `events[${index}].correlationId`),
  });
}

export function sanitizeCollection(result, itemSanitizer, collectionKey) {
  const value = requireObject(result, "providerResult");
  assertNoForbiddenKeys(value);
  requireExactKeys(value, new Set([collectionKey, "cursor"]), "providerResult");
  const items = value[collectionKey];
  if (!Array.isArray(items) || items.length > MAX_ITEMS) {
    throw new OperatorReadonlyError(
      "provider_contract_violation",
      `${collectionKey} must be a bounded array`,
      { field: collectionKey },
    );
  }
  return Object.freeze({
    [collectionKey]: Object.freeze(items.map(itemSanitizer)),
    ...(value.cursor !== undefined
      ? { cursor: requireText(value.cursor, "providerResult.cursor") }
      : {}),
  });
}
