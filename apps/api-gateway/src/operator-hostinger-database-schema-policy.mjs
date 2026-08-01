const DEFAULT_ALLOWED_HOSTS = Object.freeze([
  "apidevelopers.digital",
  "sitedauni.com",
  "api.sitedauni.com",
  "unico.sitedauni.com",
]);

const ALLOWED_ENGINES = Object.freeze(["mysql", "postgresql"]);
const ALLOWED_OBJECT_KINDS = Object.freeze(["table", "view", "trigger", "procedure"]);
const ALLOWED_CONSTRAINT_TYPES = Object.freeze([
  "primary_key",
  "unique",
  "foreign_key",
  "check",
]);
const SAFE_IDENTIFIER = /^[A-Za-z0-9_$.-]{1,128}$/;
const SAFE_TYPE = /^[A-Za-z0-9_()[\], .:-]{1,128}$/;
const SAFE_REFERENCE = /^[A-Za-z0-9 ._:-]{2,128}$/;
const FORBIDDEN_KEYS = new Set([
  "row",
  "rows",
  "sample",
  "samples",
  "value",
  "values",
  "data",
  "records",
  "record",
  "content",
  "body",
  "base64",
  "sql",
  "query",
  "connectionstring",
  "databaseurl",
  "password",
  "secret",
  "token",
  "credential",
  "credentials",
]);

export class HostingerDatabaseSchemaInventoryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "HostingerDatabaseSchemaInventoryError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function requireSchemaText(value, name, pattern = SAFE_IDENTIFIER) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new HostingerDatabaseSchemaInventoryError(
      "invalid_request",
      `${name} is required`,
      { field: name },
    );
  }
  if (!pattern.test(normalized)) {
    throw new HostingerDatabaseSchemaInventoryError(
      "invalid_request",
      `${name} contains unsupported characters`,
      { field: name },
    );
  }
  return normalized;
}

function normalizeAllowedHosts(values) {
  const source = values ?? DEFAULT_ALLOWED_HOSTS;
  if (!Array.isArray(source) || source.length === 0) {
    throw new TypeError("allowedHosts must be a non-empty array");
  }
  return Object.freeze([
    ...new Set(source.map((value) => requireSchemaText(value, "allowedHost").toLowerCase())),
  ]);
}

export function createDatabaseSchemaPolicy(allowedHosts) {
  return Object.freeze({
    allowedHosts: normalizeAllowedHosts(allowedHosts),
    allowedEngines: ALLOWED_ENGINES,
    schemaOnly: true,
    rowsAllowed: false,
    valuesAllowed: false,
  });
}

export function normalizeDatabaseSchemaRequest(input, policy) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HostingerDatabaseSchemaInventoryError(
      "invalid_request",
      "request must be an object",
    );
  }

  const institution = requireSchemaText(input.institution, "institution", SAFE_REFERENCE);
  const tenant = requireSchemaText(input.tenant, "tenant", SAFE_REFERENCE);
  const operator = requireSchemaText(input.operator, "operator", SAFE_REFERENCE);
  const correlationId = requireSchemaText(input.correlationId, "correlationId", SAFE_REFERENCE);
  const host = requireSchemaText(input.host, "host").toLowerCase();
  const logicalDatabaseId = requireSchemaText(
    input.logicalDatabaseId,
    "logicalDatabaseId",
    SAFE_REFERENCE,
  );
  const engine = requireSchemaText(input.engine, "engine").toLowerCase();

  if (!policy.allowedHosts.includes(host)) {
    throw new HostingerDatabaseSchemaInventoryError(
      "host_not_allowed",
      "host is not in the institutional allowlist",
      { host },
    );
  }
  if (!policy.allowedEngines.includes(engine)) {
    throw new HostingerDatabaseSchemaInventoryError(
      "engine_not_allowed",
      "database engine is not allowed",
      { engine },
    );
  }
  if (input.schemaOnly !== true) {
    throw new HostingerDatabaseSchemaInventoryError(
      "schema_only_required",
      "schemaOnly must be true",
    );
  }
  if (input.includeRows === true || input.includeValues === true) {
    throw new HostingerDatabaseSchemaInventoryError(
      "data_access_not_allowed",
      "rows and values are forbidden",
    );
  }

  const requestedSchemas = input.schemas ?? [];
  if (!Array.isArray(requestedSchemas) || requestedSchemas.length > 50) {
    throw new HostingerDatabaseSchemaInventoryError(
      "invalid_request",
      "schemas must be an array with at most 50 entries",
      { field: "schemas" },
    );
  }

  const schemas = Object.freeze([
    ...new Set(
      requestedSchemas.map((schema) =>
        requireSchemaText(schema, "schema", SAFE_IDENTIFIER),
      ),
    ),
  ]);

  return Object.freeze({
    operationId: "operatorHostingerDatabaseSchemaInventory",
    institution,
    tenant,
    operator,
    correlationId,
    host,
    logicalDatabaseId,
    engine,
    schemaOnly: true,
    includeRows: false,
    includeValues: false,
    schemas,
  });
}

export function assertSchemaOnlyProviderResult(value, path = "providerResult") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertSchemaOnlyProviderResult(item, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(String(key).toLowerCase())) {
      throw new HostingerDatabaseSchemaInventoryError(
        "provider_returned_data",
        "provider returned a forbidden data-bearing field",
        { path: `${path}.${key}` },
      );
    }
    assertSchemaOnlyProviderResult(child, `${path}.${key}`);
  }
}

function normalizeStringArray(values, name) {
  if (values === undefined) return Object.freeze([]);
  if (!Array.isArray(values) || values.length > 128) {
    throw new HostingerDatabaseSchemaInventoryError(
      "provider_contract_violation",
      `${name} must be an array with at most 128 entries`,
      { field: name },
    );
  }
  return Object.freeze([
    ...new Set(values.map((value) => requireSchemaText(value, name))),
  ]);
}

function sanitizeColumn(column) {
  if (!column || typeof column !== "object" || Array.isArray(column)) {
    throw new HostingerDatabaseSchemaInventoryError(
      "provider_contract_violation",
      "column must be an object",
    );
  }
  const ordinal = Number(column.ordinal);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > 100000) {
    throw new HostingerDatabaseSchemaInventoryError(
      "provider_contract_violation",
      "column ordinal is invalid",
    );
  }
  return Object.freeze({
    name: requireSchemaText(column.name, "column.name"),
    dataType: requireSchemaText(column.dataType, "column.dataType", SAFE_TYPE),
    nullable: column.nullable === true,
    ordinal,
  });
}

function sanitizeIndex(index) {
  if (!index || typeof index !== "object" || Array.isArray(index)) {
    throw new HostingerDatabaseSchemaInventoryError(
      "provider_contract_violation",
      "index must be an object",
    );
  }
  return Object.freeze({
    name: requireSchemaText(index.name, "index.name"),
    unique: index.unique === true,
    columns: normalizeStringArray(index.columns, "index.columns"),
  });
}

function sanitizeConstraint(constraint) {
  if (!constraint || typeof constraint !== "object" || Array.isArray(constraint)) {
    throw new HostingerDatabaseSchemaInventoryError(
      "provider_contract_violation",
      "constraint must be an object",
    );
  }
  const type = requireSchemaText(constraint.type, "constraint.type").toLowerCase();
  if (!ALLOWED_CONSTRAINT_TYPES.includes(type)) {
    throw new HostingerDatabaseSchemaInventoryError(
      "provider_contract_violation",
      "constraint type is unsupported",
      { type },
    );
  }

  const result = {
    name: requireSchemaText(constraint.name, "constraint.name"),
    type,
    columns: normalizeStringArray(constraint.columns, "constraint.columns"),
  };

  if (type === "foreign_key") {
    result.referencedSchema = requireSchemaText(
      constraint.referencedSchema,
      "constraint.referencedSchema",
    );
    result.referencedObject = requireSchemaText(
      constraint.referencedObject,
      "constraint.referencedObject",
    );
    result.referencedColumns = normalizeStringArray(
      constraint.referencedColumns,
      "constraint.referencedColumns",
    );
  }

  return Object.freeze(result);
}

export function sanitizeSchemaObject(object) {
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    throw new HostingerDatabaseSchemaInventoryError(
      "provider_contract_violation",
      "schema object must be an object",
    );
  }

  const kind = requireSchemaText(object.kind, "object.kind").toLowerCase();
  if (!ALLOWED_OBJECT_KINDS.includes(kind)) {
    throw new HostingerDatabaseSchemaInventoryError(
      "provider_contract_violation",
      "schema object kind is unsupported",
      { kind },
    );
  }

  const columns = object.columns ?? [];
  const indexes = object.indexes ?? [];
  const constraints = object.constraints ?? [];
  if (
    !Array.isArray(columns) ||
    !Array.isArray(indexes) ||
    !Array.isArray(constraints) ||
    columns.length > 2048 ||
    indexes.length > 512 ||
    constraints.length > 512
  ) {
    throw new HostingerDatabaseSchemaInventoryError(
      "provider_contract_violation",
      "schema object collections exceed limits",
    );
  }

  return Object.freeze({
    kind,
    schema: requireSchemaText(object.schema, "object.schema"),
    name: requireSchemaText(object.name, "object.name"),
    columns: Object.freeze(
      columns.map(sanitizeColumn).sort((left, right) => left.ordinal - right.ordinal),
    ),
    indexes: Object.freeze(
      indexes.map(sanitizeIndex).sort((left, right) => left.name.localeCompare(right.name)),
    ),
    constraints: Object.freeze(
      constraints
        .map(sanitizeConstraint)
        .sort((left, right) => left.name.localeCompare(right.name)),
    ),
  });
}
