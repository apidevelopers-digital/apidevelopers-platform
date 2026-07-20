import {
  ProvisioningDomainError,
  requireIso,
  requireText,
} from "./common.mjs";

function resourceSpec(input, type) {
  const status = requireText(input?.status ?? "pending", `${type}.status`);
  if (!["pending", "completed", "compensated"].includes(status)) {
    throw new ProvisioningDomainError(
      "invalid_resource_status",
      `${type} resource status is not supported`,
      { type, status },
    );
  }
  const result = {
    status,
    id:
      input?.id === null || input?.id === undefined
        ? null
        : requireText(input.id, `${type}.id`),
  };
  if (type === "tenant") {
    result.name = requireText(input?.name, "tenant.name");
    result.slug = requireText(input?.slug ?? input?.name, "tenant.slug");
  }
  if (type === "project") {
    result.name = requireText(input?.name, "project.name");
    result.slug = requireText(input?.slug ?? input?.name, "project.slug");
  }
  if (type === "apikey") {
    result.prefix =
      input?.prefix === null || input?.prefix === undefined
        ? null
        : requireText(input.prefix, "apikey.prefix");
  }
  if (status === "completed" && !result.id) {
    throw new ProvisioningDomainError(
      "missing_resource_id",
      `${type} completed resource requires id`,
    );
  }
  return result;
}

function compensationAction(input) {
  const status = requireText(input?.status ?? "pending", "compensation.status");
  if (!["pending", "completed", "failed"].includes(status)) {
    throw new ProvisioningDomainError(
      "invalid_compensation_status",
      "compensation status is not supported",
      { status },
    );
  }
  return {
    id: requireText(input?.id, "compensation.id"),
    action: requireText(input?.action, "compensation.action"),
    resourceType: requireText(input?.resourceType, "compensation.resourceType"),
    resourceId: requireText(input?.resourceId, "compensation.resourceId"),
    status,
    errorCode:
      input?.errorCode === null || input?.errorCode === undefined
        ? null
        : requireText(input.errorCode, "compensation.errorCode"),
    completedAt:
      input?.completedAt === null || input?.completedAt === undefined
        ? null
        : requireIso(input.completedAt, "compensation.completedAt"),
  };
}

function failureRecord(input) {
  if (input === null || input === undefined) return null;
  const step = requireText(input.step, "failure.step");
  if (!["tenant", "project", "apikey", "finalize"].includes(step)) {
    throw new ProvisioningDomainError(
      "invalid_failure_step",
      "failure step is not supported",
      { step },
    );
  }
  return {
    step,
    code: requireText(input.code, "failure.code"),
    message: requireText(input.message, "failure.message"),
    retryable: Boolean(input.retryable),
    occurredAt: requireIso(input.occurredAt, "failure.occurredAt"),
  };
}


export { resourceSpec, compensationAction, failureRecord };
