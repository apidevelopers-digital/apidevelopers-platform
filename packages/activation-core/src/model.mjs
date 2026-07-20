import {
  ActivationDomainError,
  assertNoSensitiveData,
  deepFreeze,
  requireIso,
  requirePositiveInteger,
  requireText,
} from "./common.mjs";

export const ACTIVATION_STATUSES = Object.freeze([
  "requested",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const ACTIVATION_STEPS = Object.freeze([
  "subscription",
  "provisioning",
  "finalize",
]);

function normalizeResource(input, name) {
  if (input === null) return null;
  return {
    id: requireText(input.id, `${name}.id`),
    status: requireText(input.status, `${name}.status`),
  };
}

export function createActivationSnapshot(input) {
  const status = requireText(input.status, "status");
  if (!ACTIVATION_STATUSES.includes(status)) {
    throw new ActivationDomainError(
      "invalid_activation_status",
      "activation status is not supported",
    );
  }

  const currentStep = input.currentStep === null
    ? null
    : requireText(input.currentStep, "currentStep");
  if (currentStep !== null && !ACTIVATION_STEPS.includes(currentStep)) {
    throw new ActivationDomainError(
      "invalid_activation_step",
      "activation step is not supported",
    );
  }

  const createdAt = requireIso(input.createdAt, "createdAt");
  const completedAt = input.completedAt === null
    ? null
    : requireIso(input.completedAt, "completedAt");
  const endedAt = input.endedAt === null
    ? null
    : requireIso(input.endedAt, "endedAt");

  if (status === "requested" && (input.attempt !== 0 || currentStep !== "subscription")) {
    throw new ActivationDomainError(
      "invalid_requested_activation",
      "requested activation must start at subscription with attempt zero",
    );
  }
  if (status === "running" && currentStep === null) {
    throw new ActivationDomainError(
      "missing_activation_step",
      "running activation requires currentStep",
    );
  }
  if (status === "completed" && (!completedAt || currentStep !== null)) {
    throw new ActivationDomainError(
      "invalid_completed_activation",
      "completed activation requires completedAt and no currentStep",
    );
  }
  if (["failed", "cancelled"].includes(status) && !endedAt) {
    throw new ActivationDomainError(
      "missing_ended_at",
      "failed and cancelled activation require endedAt",
    );
  }
  if (!["failed", "cancelled"].includes(status) && endedAt) {
    throw new ActivationDomainError(
      "unexpected_ended_at",
      "non-terminal failure states cannot have endedAt",
    );
  }

  const checkout = {
    id: requireText(input.checkout.id, "checkout.id"),
    accountId: requireText(input.checkout.accountId, "checkout.accountId"),
    productId: requireText(input.checkout.productId, "checkout.productId"),
    productVersion: requirePositiveInteger(
      input.checkout.productVersion,
      "checkout.productVersion",
    ),
    planId: requireText(input.checkout.planId, "checkout.planId"),
    planVersion: requirePositiveInteger(
      input.checkout.planVersion,
      "checkout.planVersion",
    ),
    paymentReference: requireText(
      input.checkout.paymentReference,
      "checkout.paymentReference",
    ),
    confirmed: input.checkout.confirmed === true,
  };
  if (!checkout.confirmed) {
    throw new ActivationDomainError(
      "checkout_not_confirmed",
      "activation requires confirmed checkout",
    );
  }

  const metadata = input.metadata ?? {};
  assertNoSensitiveData(metadata);

  return deepFreeze({
    snapshotId: requireText(input.snapshotId, "snapshotId"),
    activationId: requireText(input.activationId, "activationId"),
    revision: requirePositiveInteger(input.revision, "revision"),
    checkout,
    status,
    attempt: Number.isSafeInteger(input.attempt) && input.attempt >= 0
      ? input.attempt
      : (() => {
          throw new ActivationDomainError(
            "invalid_argument",
            "attempt must be a non-negative safe integer",
          );
        })(),
    currentStep,
    subscription: normalizeResource(input.subscription, "subscription"),
    provisioning: normalizeResource(input.provisioning, "provisioning"),
    failure: input.failure === null ? null : {
      code: requireText(input.failure.code, "failure.code"),
      step: requireText(input.failure.step, "failure.step"),
      retryable: input.failure.retryable === true,
      message: requireText(input.failure.message, "failure.message"),
    },
    compensation: (input.compensation ?? []).map((item) => ({
      action: requireText(item.action, "compensation.action"),
      targetId: requireText(item.targetId, "compensation.targetId"),
      status: requireText(item.status, "compensation.status"),
    })),
    sourceEventId: requireText(input.sourceEventId, "sourceEventId"),
    previousSnapshotId: input.previousSnapshotId === null
      ? null
      : requireText(input.previousSnapshotId, "previousSnapshotId"),
    createdAt,
    completedAt,
    endedAt,
    metadata,
  });
}

export function isTerminalActivation(snapshot) {
  return ["completed", "cancelled"].includes(snapshot.status);
}
