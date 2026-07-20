import {
  ProvisioningDomainError,
  requireText,
} from "./common.mjs";

function requireRunningStep(snapshot, step) {
  if (snapshot.status !== "running" || snapshot.currentStep !== step) {
    throw new ProvisioningDomainError(
      "invalid_provisioning_step",
      `provisioning is not running ${step} step`,
      { status: snapshot.status, currentStep: snapshot.currentStep },
    );
  }
}

export function createResourceOperations(ctx) {
  const { duplicate, current, mutable, append } = ctx;

  return {
    recordTenantProvisioned({
      provisioningId,
      sourceEventId,
      tenantId,
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(provisioningId);
      mutable(previous);
      requireRunningStep(previous, "tenant");
      return append(
        previous,
        sourceEventId,
        {
          tenant: {
            ...previous.tenant,
            status: "completed",
            id: requireText(tenantId, "tenantId"),
          },
          currentStep: "project",
        },
        "provisioning.tenant.completed",
        { tenantId },
      );
    },

    recordProjectProvisioned({
      provisioningId,
      sourceEventId,
      projectId,
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(provisioningId);
      mutable(previous);
      requireRunningStep(previous, "project");
      if (previous.tenant.status !== "completed") {
        throw new ProvisioningDomainError(
          "tenant_not_provisioned",
          "project cannot be recorded before tenant",
        );
      }
      return append(
        previous,
        sourceEventId,
        {
          project: {
            ...previous.project,
            status: "completed",
            id: requireText(projectId, "projectId"),
          },
          currentStep: "apikey",
        },
        "provisioning.project.completed",
        { tenantId: previous.tenant.id, projectId },
      );
    },

    recordApiKeyIssued({
      provisioningId,
      sourceEventId,
      apiKeyId,
      prefix,
    }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(provisioningId);
      mutable(previous);
      requireRunningStep(previous, "apikey");
      if (previous.project.status !== "completed") {
        throw new ProvisioningDomainError(
          "project_not_provisioned",
          "API key cannot be recorded before project",
        );
      }
      return append(
        previous,
        sourceEventId,
        {
          apikey: {
            status: "completed",
            id: requireText(apiKeyId, "apiKeyId"),
            prefix: requireText(prefix, "prefix"),
          },
          currentStep: "finalize",
        },
        "provisioning.apikey.completed",
        {
          tenantId: previous.tenant.id,
          projectId: previous.project.id,
          apiKeyId,
          prefix,
        },
      );
    },

    completeProvisioning({ provisioningId, sourceEventId }) {
      const repeated = duplicate(sourceEventId);
      if (repeated) return repeated;
      const previous = current(provisioningId);
      mutable(previous);
      requireRunningStep(previous, "finalize");
      if (
        previous.tenant.status !== "completed" ||
        previous.project.status !== "completed" ||
        previous.apikey.status !== "completed"
      ) {
        throw new ProvisioningDomainError(
          "incomplete_resources",
          "all resources must be completed before provisioning",
        );
      }
      return append(
        previous,
        sourceEventId,
        {
          status: "completed",
          currentStep: null,
          failure: null,
          compensation: [],
        },
        "provisioning.completed",
        {
          tenantId: previous.tenant.id,
          projectId: previous.project.id,
          apiKeyId: previous.apikey.id,
          apiKeyPrefix: previous.apikey.prefix,
        },
      );
    },
  };
}
