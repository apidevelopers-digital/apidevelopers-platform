import {
  OPERATOR_READONLY_CAPABILITIES,
  OperatorReadonlyError,
  auditMetadata,
  normalizeContext,
  normalizeTarget,
  normalizeTimestamp,
  operationEnvelope,
  requireObject,
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

export function createOperatorReadonlyExecutor({
  adapters,
  auditRecorder,
  now = () => new Date().toISOString(),
} = {}) {
  const resolvedAdapters = requireAdapters(adapters);
  const resolvedAudit = requireAuditRecorder(auditRecorder);
  if (typeof now !== "function") throw new TypeError("now must be a function");

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

  return async function execute({
    capability,
    rawContext,
    rawTarget,
    request,
    sanitize,
  }) {
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
            "audit_unavailable",
            "operator read failure could not be audited",
          );
        }
      }
      throw normalized;
    }
  };
}
