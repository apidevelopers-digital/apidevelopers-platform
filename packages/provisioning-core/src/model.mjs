import {
  ProvisioningDomainError,assertNoSensitiveData,deepFreez,requireIso,requirePositiveInteger,requireText
} from "./common.mjs";

export { ProvisioningDomainError } from "./common.mjs";

export const PROVISIONING_STATUSES = Object.freeze([
  "requested",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const PROVISIONING_STEPS = Object.freeze([
  "tenant",
  "project",
  "apikey",
  "finalize",
]);

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
  if (!PROVISIONING_STEPS.includes(step)) {
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

export function createProvisioningSnapshot(input) {
  const status = requireText(input.status, "status");
  if (!PROVISIONING_STATUSES.includes(status)) {
    throw new ProvisioningDomainError(
      "invalid_provisioning_status",
      "provisioning status is not supported",
      { status },
    );
  }
  const currentStep =
    input.currentStep === null || input.currentStep === undefined
      ? null
      : requireText(input.currentStep, "currentStep");
  if (currentStep !== null && !PROVISIONING_STEPS.includes(currentStep)) {
    throw new ProvisioningDomainError(
      "invalid_provisioning_step",
      "current provisioning step is not supported",
      { currentStep },
    );
  }

  const tenant = resourceSpec(input.tenant, "tenant");
  const project = resourceSpec(input.project, "project");
  const apikey = resourceSpec(input.apikey, "apikey");
  const failure = failureRecord(input.failure);
  const compensation = (input.compensation ?? []).map(compensationAction);
  const metadata = input.metadata ?? {};
  assertNoSensitiveData(metadata);

  if (status === "completed") {
    if (
      tenant.status !== "completed" ||
      project.status !== "completed" ||
      apikey.status !== "completed"
    ) {
      throw new ProvisioningDomainError(
        "incomplete_resources",
        "completed provisioning requires tenant, project and API key",
      );
    }
    if (currentStep !== null || failure !== null || compensation.length > 0) {
      throw new ProvisioningDomainError(
        "invalid_completed_provisioning",
        "completed provisioning cannot retain active step, failure or compensation",
     );
    }
  }
  if (status === "failed" && failure === null) {
    throw new ProvisioningDomainError(
      "missing_failure",
      "failed provisioning requires failure details",
    );
  }
  if (status !== "failed" && failure !== null) {
    throw new ProvisioningDomainError(
      "unexpected_failure",
      "only failed provisioning can retain failure details",
    );
  }
  if (status !== "failed" && compensation.length > 0) {
    throw new ProvisioningDomainError(
      "unexpected_compensation",
      "only failed provisioning can retain compensation actions",
    );
  }
  if (status === "cancelled" && currentStep !== null) {
    throw new ProvisioningDomainError(
      "invalid_cancelled_provisioning",
      "cancelled provisioning cannot retain current step",
    );
  }

  return deepFreeze({
    snapshotId: requireText(input.snapshotId, "snapshotId"),
    provisioningId: requireText(input.provisioningId, "provisioningId"),
    revision: requirePositiveInteger(input.revision, "revision"),
    subscriptionId: requireText(input.subscriptionId, "subscriptionId"),
    accountId: requireText(input.accountId, "accountId"),
    ownerUserId: requireText(input.ownerUserId, "ownerUserId"),
    productId: requireText(input.productId, "productId"),
    productVersion: requirePositiveInteger(
      input.productVersion,
      "productVersion",
    ),
    planId: requireText(input.planId, "planId"),
    planVersion: requirePositiveInteger(input.planVersion, "planVersion"),
    status,
    attempt:
      Number.isSafeInteger(input.attempt) && input.attempt >= 0
        ? input.attempt
        : (() => {
            throw new ProvisioningDomainError(
              "invalid_argument",
              "attempt must be a non-negative safe integer",
            );
          })(),
    currentStep,
    tenant,
    project,
    apikey,
    failure,
    compensation,
    sourceEventId: requireText(input.sourceEventId, "sourceEventId"),
    previousSnapshotId:
      input.previousSnapshotId === null ||
      input.previousSnapshotId === undefined
        ? null
        : requireText(input.previousSnapshotId, "previousSnapshotId"),
    createdAt: requireIso(input.createdAt, "createdAt"),
    metadata,
  });
}

export function isTerminalProvisioning(snapshot) {
  return ["completed", "cancelled"].includes(snapshot?.status);
}
