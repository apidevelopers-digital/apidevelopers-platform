import {
  ProvisioningDomainError,
  assertNoSensitiveData,
  deepFreeze,
  requireIso,
  requirePositiveInteger,
  requireText,
} from "./common.mjs";
import {
  compensationAction,
  failureRecord,
  resourceSpec,
} from "./model-resources.mjs";

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
