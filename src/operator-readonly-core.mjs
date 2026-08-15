import {
  DEFAULT_OPERATOR_READ_FIELDS,
  OPERATOR_READONLY_CAPABILITIES,
  OperatorReadonlyError,
  assertNoForbiddenKeys,
  createUnavailableOperatorReadonlyAdapters,
  normalizeCursor,
  normalizeLimit,
  normalizeRequestedFields,
  requireExactKeys,
  requireObject,
  requireText,
} from "./operator-readonly-contract.mjs";
import { createOperatorReadonlyExecutor } from "./operator-readonly-executor.mjs";
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

export function createOperatorReadonlyCore({
  adapters = createUnavailableOperatorReadonlyAdapters(),
  auditRecorder,
  allowedReadFields = DEFAULT_OPERATOR_READ_FIELDS,
  now,
} = {}) {
  const safeReadFields = normalizeRequestedFields(
    allowedReadFields,
    DEFAULT_OPERATOR_READ_FIELDS,
  );
  const execute = createOperatorReadonlyExecutor({
    adapters,
    auditRecorder,
    ...(now ? { now } : {}),
  });

  return Object.freeze({
    capabilities: OPERATOR_READONLY_CAPABILITIES,
    allowedReadFields: safeReadFields,

    operatorStatus(input = {}) {
      const cursor = normalizeCursor(input.cursor);
      return execute({
        capability: "status",
        rawContext: input.context,
        rawTarget: input.target,
        request: {
          limit: normalizeLimit(input.limit),
          ...(cursor ? { cursor } : {}),
        },
        sanitize: (result) =>
          sanitizeCollection(result, sanitizeStatusItem, "items"),
      });
    },

    operatorInventory(input = {}) {
      const cursor = normalizeCursor(input.cursor);
      return execute({
        capability: "inventory",
        rawContext: input.context,
        rawTarget: input.target,
        request: {
          limit: normalizeLimit(input.limit),
          ...(cursor ? { cursor } : {}),
        },
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
      const cursor = normalizeCursor(input.cursor);
      return execute({
        capability: "audit",
        rawContext: input.context,
        rawTarget: input.target,
        request: {
          limit: normalizeLimit(input.limit),
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
