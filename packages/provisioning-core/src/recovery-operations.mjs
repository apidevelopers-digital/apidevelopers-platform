import {
  ProvisioningDomainError,
  requireIso,
  requireText,
} from "./common.mjs";

function compensationPlan(snapshot, actionIdFactory) {
  const actions = [];
  if (snapshot.apikey.status === "completed") {
    actions.push({
      id: requireText(actionIdFactory(), "actionIdFactory result"),
      action: "revoke_api_key",
      resourceType: "apikey",
      resourceId: snapshot.apikey.id,
      status: "pending",
      errorCode: null,
      completedAt: null,
    });
  }
  if (snapshot.project.status === "completed") {
    actions.push({
      id: requireText(actionIdFactory(), "actionIdFactory result"),
      action: "delete_project",
      resourceType: "project",
      resourceId: snapshot.project.id,
      status: "pending",
      errorCode: null,
      completedAt: null,
    });
  }
  if (snapshot.tenant.status === "completed") {
    actions.push({
      id: requireText(actionIdFactory(), "actionIdFactory result"),
      action: "cancel_tenant",
      resourceType: "tenant",
      resourceId: snapshot.tenant.id,
      status: "pending",
      errorCode: null,
      completedAt: null,
    });
  }
  return actions;
}

function allCompensated(snapshot) {
  return snapshot.compensation.every((action) => action.status === "completed");
}

export function createRecoveryOperations(ctx) {
  const {
    duplicate,
    current,
    mutable,
    append,
    actionIdFactory,
    now,
  } = ctx;

  return {
    failProvisioning({
      provisioningId,
      sourceEventId,
      step,
      code,
      message,
      retryable = true,
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(provisioningId);
      mutable(previous);
      if (!["requested", "running"].includes(previous.status)) {
        throw new ProvisioningDomainError(
          "invalid_provisioning_transition",
          "only requested or running provisioning can fail",
          { status: previous.status },
        );
      }
      const occurredAt = now();
      const compensation = compensationPlan(previous, actionIdFactory);
      return append(
        previous,
        sourceEventId,
        {
          status: "failed",
          currentStep: requireText(step, "step"),
          failure: {
            step,
            code,
            message,
            retryable,
            occurredAt,
          },
          compensation,
        },
        "provisioning.failed",
        {
          step,
          code,
          retryable: Boolean(retryable),
          compensationCount: compensation.length,
        },
      );
    },

    recordCompensation({
      provisioningId,
      sourceEventId,
      actionId,
      status = "completed",
      errorCode = null,
      completedAt = now(),
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(provisioningId);
      if (previous.status !== "failed") {
        throw new ProvisioningDomainError(
          "invalid_provisioning_transition",
          "compensation can only be recorded for failed provisioning",
        );
      }
      if (!["completed", "failed"].includes(status)) {
        throw new ProvisioningDomainError(
          "invalid_compensation_status",
          "compensation result must be completed or failed",
        );
      }
      const index = previous.compensation.findIndex(
        (action) => action.id === actionId,
      );
      if (index < 0) {
        throw new ProvisioningDomainError(
          "compensation_not_found",
          "compensation action was not found",
          { actionId },
        );
      }
      if (previous.compensation[index].status === "completed") {
        throw new ProvisioningDomainError(
          "compensation_already_completed",
          "completed compensation cannot be changed",
        );
      }

      const compensation = previous.compensation.map((action, position) =>
        position === index
          ? {
              ...action,
              status,
              errorCode:
                status === "failed"
                  ? requireText(errorCode, "errorCode")
                  : null,
              completedAt:
                status === "completed"
                  ? requireIso(completedAt, "completedAt")
                  : null,
            }
          : action,
      );
      const completedAction = compensation[index];
      const resourcePatch = {};
      if (status === "completed") {
        if (completedAction.resourceType === "apikey") {
          resourcePatch.apikey = {
            ...previous.apikey,
            status: "compensated",
          };
        }
        if (completedAction.resourceType === "project") {
          resourcePatch.project = {
            ...previous.project,
            status: "compensated",
          };
        }
        if (completedAction.resourceType === "tenant") {
          resourcePatch.tenant = {
            ...previous.tenant,
            status: "compensated",
          };
        }
      }
      return append(
        previous,
        sourceEventId,
        { compensation, ...resourcePatch },
        status === "completed"
          ? "provisioning.compensation.completed"
          : "provisioning.compensation.failed",
        {
          actionId,
          action: completedAction.action,
          resourceType: completedAction.resourceType,
          resourceId: completedAction.resourceId,
          errorCode: status === "failed" ? errorCode : null,
        },
      );
    },

    retryProvisioning({ provisioningId, sourceEventId }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(provisioningId);
      if (previous.status !== "failed") {
        throw new ProvisioningDomainError(
          "invalid_provisioning_transition",
          "only failed provisioning can retry",
          { status: previous.status },
        );
      }
      if (!previous.failure.retryable) {
        throw new ProvisioningDomainError(
          "provisioning_not_retryable",
          "failure is not retryable",
        );
      }
      if (!allCompensated(previous)) {
        throw new ProvisioningDomainError(
          "compensation_incomplete",
          "all compensation actions must complete before retry",
        );
      }
      return append(
        previous,
        sourceEventId,
        {
          status: "requested",
          currentStep: "tenant",
          tenant: {
            ...previous.tenant,
            status: "pending",
            id: null,
          },
          project: {
            ...previous.project,
            status: "pending",
            id: null,
          },
          apikey: {
            status: "pending",
            id: null,
            prefix: null,
          },
          failure: null,
          compensation: [],
        },
        "provisioning.retry.requested",
        { previousAttempt: previous.attempt },
      );
    },

    cancelProvisioning({
      provisioningId,
      sourceEventId,
      reason = "requested",
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(provisioningId);
      mutable(previous);
      const cancellable =
        previous.status === "requested" ||
        (previous.status === "failed" && allCompensated(previous));
      if (!cancellable) {
        throw new ProvisioningDomainError(
          "provisioning_not_cancellable",
          "provisioning can only cancel while requested or fully compensated",
          { status: previous.status },
        );
      }
      return append(
        previous,
        sourceEventId,
        {
          status: "cancelled",
          currentStep: null,
          failure: null,
          compensation: [],
        },
        "provisioning.cancelled",
        { reason: requireText(reason, "reason") },
      );
    },
  };
}
