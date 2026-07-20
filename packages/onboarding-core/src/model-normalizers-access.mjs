import { OnboardingDomainError, requirePositiveInteger, requireText } from "./common.mjs";

export function normalizeApiKey(input) {
  if (input === null) return null;
  const apiKey = {
    id: requireText(input.id, "apiKey.id"),
    prefix: requireText(input.prefix, "apiKey.prefix"),
    status: requireText(input.status, "apiKey.status"),
    deliveryRecorded: input.deliveryRecorded === true,
  };
  if (apiKey.status !== "ready") {
    throw new OnboardingDomainError(
      "invalid_apikey_status",
      "API key status must be ready",
    );
  }
  return apiKey;
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
