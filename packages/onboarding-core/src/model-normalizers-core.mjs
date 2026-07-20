import { OnboardingDomainError, requirePositiveInteger, requireText } from "./common.mjs";

export function normalizeRef(input, name, allowedStatuses) {
  if (input === null) return null;
  const status = requireText(input.status, `${name}.status`);
  if (!allowedStatuses.includes(status)) {
    throw new OnboardingDomainError(
      `invalid_${name}_status`,
      `${name} status is not supported`,
      { status },
    );
  }
  return {
    id: requireText(input.id, `${name}.id`),
    status,
  };
}

export function normalizeActivation(input) {
  const activation = {
    id: requireText(input.id, "activation.id"),
    accountId: requireText(input.accountId, "activation.accountId"),
    checkoutId: requireText(input.checkoutId, "activation.checkoutId"),
    subscriptionId: requireText(
      input.subscriptionId,
      "activation.subscriptionId",
    ),
    provisioningId: requireText(
      input.provisioningId,
      "activation.provisioningId",
   ),
    completed: input.completed === true,
  };
  if (!activation.completed) {
    throw new OnboardingDomainError(
      "activation_not_completed",
      "onboarding requires completed activation",
   );
  }
  return activation;
}

export function normalizeWorkspace(input) {
  if (input === null) return null;
  const workspace = {
    tenantId: requireText(input.tenantId, "workspace.tenantId"),
    projectId: requireText(input.projectId, "workspace.projectId"),
    status: requireText(input.status, "workspace.status"),
  };
  if (workspace.status !== "ready") {
    throw new OnboardingDomainError(
      "invalid_workspace_status",
      "workspace status must be ready",
    );
  }
  return workspace;
}
