import {
  DEFAULT_OPERATOR_READ_FIELDS,
  OPERATOR_READONLY_CAPABILITIES,
  OperatorReadonlyError,
  assertNoForbiddenKeys,
  auditMetadata,
  createUnavailableOperatorReadonlyAdapters,
  normalizeContext,
  normalizeCursor,
  normalizeLimit,
  normalizeRequestedFields,
  normalizeTarget,
  normalizeTimestamp,
  operationEnvelope,
  requireExactKeys,
  requireObject,
  requireText,
} from "./operator-readonly-contract.mjs";
import {
  sanitizeAuditEvent,
  sanitizeCollection,
  sanitizeInventoryItem,
  sanitizeReadResource,
  sanitizeStatusItem,
} from "./operator-readonly-sanitizers.mjs";

export {
  DEFAULT_OPERATOR_READ_FIELDS,
  OPERATOR_READONLY_CAPABILITIES,
  OperatorReadonlyError,
  createUnavailableOperatorReadonlyAdapters,
} from "./operator-readonly-contract.mjs";

function requireAdapters(adapters) {
  const value = requireObject(adapters, "adapters");
  for (const operation of Object.keys(OPERATOR_READONLY_CAPABILITIES)) {
    if (typeof value[operation] !== "function") {
      throw new TypeError(`adapters.${operation} must be a function`);
    }
  }
  return value;
}

function requireAuditRecorder(auditRecorder) {
  if (typeof auditRecorder?.recordOperatorCapabilityResult !== "function") {
    throw new TypeError(
      "auditRecorder.recordOperatorCapabilityResult must be a function",
    );
  }
  return auditRecorder;
}

export function createOperatorReadonlyCore({
  adapters = createUnavailableOperatorReadonlyAdapters(),
  auditRecorder,
  allowedReadFields = DEFAULT_OPERATOR_READ_FIELDS,
  now = () => new Date().toISOString(),
} = {}) {
  const resolvedAdapters = requireAdapters(adapters);
  const resolvedAudit = requireAuditRecorder(auditRecorder);
  if (typeof now !== "function") throw new TypeError("now must be a function");
  const safeReadFields = normalizeRequestedFields(
    allowedReadFields,
    DEFAULT_OPERATOR_READ_FIELDS,
  );

  async function record({ context, capability, target, outcome, result, errorCode }) {
    return resolvedAudit.recordOperatorCapabilityResult({
      identity: { principal: { id: context.operator, tenantId: context.tenant } },
      tenantId: context.tenant,
      action: `operator.readonly.${capability}`,
      resource: `${target.provider}:${target.resourceType}${
        target.resourceId ? `:${target.resourceId}` : ""
      }`,
      outcome,
      correlationId: context.correlationId,
      metadata: auditMetadata({
        operationId: OPERATOR_READONLY_CAPABILITIES[capability].operationId,
        target,
        result,
        errorCode,
      }),
    });
  }

  async function execute({ capability, rawContext, rawTarget, request, sanitize }) {
    const context = normalizeContext(rawContext);
    const target = normalizeTarget(rawTarget, capability === "read");
    const operation = OPERATOR_READONLY_CAPABILITIES[capability];

    try {
      const providerResult = await resolvedAdapters[capability]({
        ...request,
        target,
        tenant: context.tenant,
        operator: context.operator,
        correlationId: context.correlationId,
        includeContent: false,
        includeRows: false,
        includeValues: false,
      });
      const result = sanitize(providerResult);

      try {
        await record({ context, capability, target, outcome: "success", result });
      } catch {
        throw new OperatorReadonlyError(
          "audit_unavailable",
          "successful operator read could not be audited",
        );
      }

      return operationEnvelope(
        operation.operationId,
        context,
        target,
        normalizeTimestamp(now(), "generatedAt"),
        result,
      );
    } catch (error) {
      const normalized =
        error instanceof OperatorReadonlyError
          ? error
          : new OperatorReadonlyError(
              "internal_error",
              "operator read-only operation failed",
            );

      if (normalized.code !== "audit_unavailable") {
        try {
          await record({
            context,
            capability,
            target,
            outcome: "failure",
            errorCode: normalized.code,
          });
        } catch {
          throw new OperatorReadonlyError(
            "audit_unavaille",
            "operator read failure could not be audited",
         );
        }
      }
      throw normalized;
    }
  }

  return Object.freeze({
    capabilities: OPERATOR_READONLY_CAPABILITIES,
    allowedReadFields: safeReadFields,

    operatorStatus(input = {}) {
      const limit = normalizeLimit(input.limit);
      const cursor = normalizeCursor(input.cursor);
      return execute({
        capability: "status",
        rawContext: input.context,
        rawTarget: input.target,
        request: { limit, ...(cursor ? { cursor } : {}) },
        sanitize: (result) =>
          sanitizeCollection(result, sanitizeStatusItem, "items"),
      });
    },

    operatorInventory(input = {}) {
      const limit = normalizeLimit(input.limit);
      const cursor = normalizeCursor(input.cursor);
      return execute({
        capability: "inventory",
        rawContext: input.context,
        rawTarget: input.target,
        request: { limit, ...(cursor ? { cursor } : {}) },
        sanitize: (result) =>
          sanitizeCollection(result, sanitizeInventoryItem, "items"),
      });
    },

    operatorRead(input = {}) {
      const fields = normalizeRequestedFields(input.fields, safeReadFields);
      return execute({
        capability: "read",
        rawContext: input.context,
        rawTarget: input.target,
        request: { fields: [...fields] },
        sanitize: (result) => {
          const value = requireObject(result, "providerResult");
          assertNoForbiddenKeys(value);
          requireExactKeys(value, new Set(["resource"]), "providerResult");
          return Object.freeze({
            resource: sanitizeReadResource(value.resource, fields),
          });
        },
      });
    },

    operatorAudit(input = {}) {
      const limit = normalizeLimit(input.limit);
      const cursor = normalizeCursor(input.cursor);
      return execute({
        capability: "audit",
        rawContext: input.context,
        rawTarget: input.target,
        request: {
          limit,
          ...(cursor ? { cursor } : {}),
          ...(input.outcome
            ? {
                outcome: requireText(
                  input.outcome,
                  "outcome",
                  /^[a-z_]{2,32}$/,
                ),
              }
            : {}),
        },
        sanitize: (result) =>
          sanitizeCollection(result, sanitizeAuditEvent, "events"),
      });
    },
  });
}
