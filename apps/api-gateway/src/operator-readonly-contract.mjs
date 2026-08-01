const SAFE_TEXT = /^[A-Za-z0-9][A-Za-z0-9 ._:@/-]{0,127}$/;
const SAFE_FIELD = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
export const SAFE_CAPABILITY = /^[a-z][a-z0-9:._-]{1,127}$/;
export const MAX_ITEMS = 200;
export const MAX_STRING = 512;

export const FORBIDDEN_KEYS = Object.freeze(new Set([
  "authorization", "base64", "body", "connectionstring", "content", "cookie",
  "credential", "credentials", "databaseurl", "env", "environmentvariables",
  "metadata", "password", "payload", "query", "raw", "record", "records",
  "row", "rows", "secret", "secrets", "set-cookie", "sql", "token", "tokens",
]));

export const OPERATOR_READONLY_CAPABILITIES = Object.freeze({
  status: Object.freeze({ operationId: "operatorStatus", scope: "operator:status:read" }),
  inventory: Object.freeze({ operationId: "operatorInventory", scope: "operator:inventory:read" }),
  read: Object.freeze({ operationId: "operatorRead", scope: "operator:resource:read" }),
  audit: Object.freeze({ operationId: "operatorAudit", scope: "operator:audit:read" }),
});

export const DEFAULT_OPERATOR_READ_FIELDS = Object.freeze([
  "id", "kind", "name", "status", "version", "updatedAt", "owner", "region",
  "environment", "repository", "branch",
]);

export class OperatorReadonlyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OperatorReadonlyError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OperatorReadonlyError("invalid_request", `${name} must be an object`, { field: name });
  }
  return value;
}

export function requireText(value, name, pattern = SAFE_TEXT) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new OperatorReadonlyError("invalid_request", `${name} is required`, { field: name });
  }
  if (
    !pattern.test(normalized) ||
    normalized.includes("..") ||
    normalized.includes("\\") ||
    normalized.includes("\0") ||
    normalized.includes("://")
  ) {
    throw new OperatorReadonlyError("invalid_request", `${name} is not a safe identifier`, { field: name });
  }
  return normalized;
}

export function normalizeContext(input) {
  const value = requireObject(input, "context");
  return Object.freeze({
    institution: requireText(value.institution, "context.institution"),
    tenant: requireText(value.tenant, "context.tenant"),
    operator: requireText(value.operator, "context.operator"),
    correlationId: requireText(value.correlationId, "context.correlationId"),
  });
}

export function normalizeTarget(input, resourceRequired = false) {
  const value = requireObject(input, "target");
  const target = {
    provider: requireText(value.provider, "target.provider"),
    resourceType: requireText(value.resourceType, "target.resourceType"),
  };
  if (resourceRequired || value.resourceId !== undefined) {
    target.resourceId = requireText(value.resourceId, "target.resourceId");
  }
  return Object.freeze(target);
}

export function normalizeLimit(value, fallback = 50) {
  const normalized = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > MAX_ITEMS) {
    throw new OperatorReadonlyError(
      "invalid_request",
      `limit must be an integer between 1 and ${MAX_ITEMS}`,
      { field: "limit" },
    );
  }
  return normalized;
}

export function normalizeCursor(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return requireText(value, "cursor");
}

export function normalizeRequestedFields(value, allowedFields) {
  const source = value ?? DEFAULT_OPERATOR_READ_FIELDS;
  if (!Array.isArray(source) || source.length === 0 || source.length > allowedFields.length) {
    throw new OperatorReadonlyError("invalid_request", "fields must be a non-empty bounded array", {
      field: "fields",
    });
  }
  const allowed = new Set(allowedFields);
  const result = [...new Set(source.map((field) => requireText(field, "field", SAFE_FIELD)))];
  for (const field of result) {
    if (!allowed.has(field)) {
      throw new OperatorReadonlyError("field_not_allowed", "field is outside the safe projection", {
        field,
      });
    }
  }
  return Object.freeze(result);
}

export function assertNoForbiddenKeys(value, path = "providerResult") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(String(key).toLowerCase())) {
      throw new OperatorReadonlyError(
        "provider_returned_sensitive_data",
        "provider returned a forbidden data-bearing field",
        { path: `${path}.${key}` },
      );
    }
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}

export function requireExactKeys(value, allowedKeys, path) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new OperatorReadonlyError(
        "provider_contract_violation",
        "provider returned an unsupported field",
        { path: `${path}.${key}` },
      );
    }
  }
}

export function normalizeTimestamp(value, name) {
  const normalized = requireText(value, name, /^[0-9T:+Z._-]{10,64}$/);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new OperatorReadonlyError(
      "provider_contract_violation",
      `${name} is not a valid timestamp`,
      { field: name },
    );
  }
  return normalized;
}

export function operationEnvelope(operationId, context, target, generatedAt, data) {
  return Object.freeze({
    operationId,
    institution: context.institution,
    tenant: context.tenant,
    operator: context.operator,
    correlationId: context.correlationId,
    target,
    generatedAt,
    productionChanged: false,
    contentReturned: false,
    rowsReturned: false,
    valuesReturned: false,
    ...data,
  });
}

export function auditMetadata({ operationId, target, result, errorCode }) {
  const count = result?.items?.length ?? result?.events?.length ?? (result?.resource ? 1 : 0);
  return Object.freeze({
    operationId,
    provider: target.provider,
    resourceType: target.resourceType,
    resourceSpecified: Boolean(target.resourceId),
    itemCount: Number.isSafeInteger(count) ? count : 0,
    productionChanged: false,
    contentReturned: false,
    rowsReturned: false,
    valuesReturned: false,
    errorCode: errorCode ?? "none",
  });
}

export function createUnavailableOperatorReadonlyAdapters() {
  const unavailable = async (operation) => {
    throw new OperatorReadonlyError("adapter_unavailable", `${operation} adapter is unavailable`);
  };
  return Object.freeze({
    status: () => unavailable("operatorStatus"),
    inventory: () => unavailable("operatorInventory"),
    read: () => unavailable("operatorRead"),
    audit: () => unavailable("operatorAudit"),
  });
}
