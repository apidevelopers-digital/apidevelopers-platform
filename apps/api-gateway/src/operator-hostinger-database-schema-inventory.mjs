import {
  HostingerDatabaseSchemaInventoryError,
  assertSchemaOnlyProviderResult,
  createDatabaseSchemaPolicy,
  normalizeDatabaseSchemaRequest,
  requireSchemaText,
  sanitizeSchemaObject,
} from "./operator-hostinger-database-schema-policy.mjs";

function normalizeTimestamp(value) {
  const timestamp = requireSchemaText(value, "generatedAt", /^[0-9T:Z+_.-]{10,64}$/);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new HostingerDatabaseSchemaInventoryError(
      "provider_contract_violation",
      "generatedAt must be a valid ISO timestamp",
    );
  }
  return timestamp;
}

export function createUnavailableHostingerDatabaseSchemaAdapter() {
  return Object.freeze({
    async inspectSchema() {
      throw new HostingerDatabaseSchemaInventoryError(
        "adapter_unavailable",
        "Hostinger database schema adapter is unavailable",
      );
    },
  });
}

export function createHostingerDatabaseSchemaInventoryService({
  schemaAdapter = createUnavailableHostingerDatabaseSchemaAdapter(),
  allowedHosts,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof schemaAdapter?.inspectSchema !== "function") {
    throw new TypeError("schemaAdapter.inspectSchema must be a function");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }

  const policy = createDatabaseSchemaPolicy(allowedHosts);

  return Object.freeze({
    policy,

    async inventory(input) {
      const request = normalizeDatabaseSchemaRequest(input, policy);

      const providerResult = await schemaAdapter.inspectSchema({
        host: request.host,
        logicalDatabaseId: request.logicalDatabaseId,
        engine: request.engine,
        schemas: [...request.schemas],
        schemaOnly: true,
        includeRows: false,
        includeValues: false,
        correlationId: request.correlationId,
      });

      if (
        !providerResult ||
        typeof providerResult !== "object" ||
        Array.isArray(providerResult)
      ) {
        throw new HostingerDatabaseSchemaInventoryError(
          "provider_contract_violation",
          "provider result must be an object",
        );
      }

      assertSchemaOnlyProviderResult(providerResult);

      if (!Array.isArray(providerResult.objects)) {
        throw new HostingerDatabaseSchemaInventoryError(
          "provider_contract_violation",
          "provider result must contain an objects array",
        );
      }

      if (providerResult.objects.length > 10000) {
        throw new HostingerDatabaseSchemaInventoryError(
          "provider_contract_violation",
          "provider returned too many schema objects",
        );
      }

      const objects = providerResult.objects
        .map(sanitizeSchemaObject)
        .sort((left, right) => {
          const schemaOrder = left.schema.localeCompare(right.schema);
          if (schemaOrder !== 0) return schemaOrder;
          const kindOrder = left.kind.localeCompare(right.kind);
          if (kindOrder !== 0) return kindOrder;
          return left.name.localeCompare(right.name);
        });

      return Object.freeze({
        operationId: request.operationId,
        institution: request.institution,
        tenant: request.tenant,
        operator: request.operator,
        correlationId: request.correlationId,
        host: request.host,
        logicalDatabaseId: request.logicalDatabaseId,
        engine: request.engine,
        generatedAt: normalizeTimestamp(now()),
        schemaOnly: true,
        rowsReturned: false,
        valuesReturned: false,
        productionChanged: false,
        objectCount: objects.length,
        objects: Object.freeze(objects),
      });
    },
  });
}
