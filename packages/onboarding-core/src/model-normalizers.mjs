import {
  OnboardingDomainError,
  requirePositiveInteger,
  requireText,
} from "./common.mjs";

export function normalizeRef(input, name, allowedStatus) {
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
  if (!input || input.completed !== true) {
    throw new OnboardingDomainError(
      "activation_not_completed",
      "onboarding requires completed activation",
    );
  }
  return {
    id: requireText(input.id, "activation.id"),
    accountId: requireText(input.accountId, "activation.accountId"),
    checkoutId: requireText(input.checkoutId, "activation.checkoutId"),
    subscriptionId: requireText(input.subscriptionId, "activation.subscriptionId"),
    provisioningId: requireText(input.provisioningId, "activation.provisioningId"),
    completed: true,
  };
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

export function normalizeApiKey(input) {
  if (input === null) return null;
  const apiKey = {
    id: requireText(input.id, "apiKey.id"),
    prefix: requireText(input.prefix, "apiKey.prefix"),
    status: requireText(input.status, "apiKey.status"),
    deliveryRecorded: input.deliveryRecorded === true,
  };
  if (apiKey.status !== "ready" || !apiKey.deliveryRecorded) {
    throw new OnboardingDomainError(
      "invalid_apikey_status",
      "API key must be ready with secure delivery recorded",
    );
  }
  return apiKey;
}

export function normalizeFirstTest(input) {
  if (input === null) return null;
  const status = requireText(input.status, "firstTest.status");
  if (!["requested", "completed"].includes(status)) {
    throw new OnboardingDomainError(
      "invalid_first_test_status",
      "first test status is not supported",
    { status },
    );
  }
  const successful = input.successful === true;
  if (status === "requested" && successful) {
    throw new OnboardingDomainError(
      "invalid_first_test",
      "requested first test cannot be successful",
    );
  }
  return {
    id: requireText(input.id, "firstTest.id"),
    status,
    successful,
    usageEventId:
      input.usageEventId === null
        ? null
        : requireText(input.usageEventId, "firstTest.usageEventId"),
    attempt: requirePositiveInteger(input.attempt ?? 1, "firstTest.attempt"),
  };
}

export function normalizeDocumentation(input) {
  if (input === null) return null;
  const documentation = {
    documentId: requireText(input.documentId, "documentation.documentId"),
    status: requireText(input.status, "documentation.status"),
  };
  if (documentation.status !== "opened") {
    throw new OnboardingDomainError(
      "invalid_documentation_status",
      "documentation status must be opened",
    );
  }
  return documentation;
}

export function normalizeFailure(input) {
  if (input === null) return null;
  return {
    code: requireText(input.code, "failure.code"),
    step: requireText(input.step, "failure.step"),
    retryable: input.retryable === true,
    message: requireText(input.message, "failure.message"),
  };
}
