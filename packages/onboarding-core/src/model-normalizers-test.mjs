import { OnboardingDomainError, requirePositiveInteger, requireText } from "./common.mjs";

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
      "invalid_first_test_state",
      "requested first test cannot be successful",
    );
  }
  if (
    status === "completed" &&
    input.successful !== true &&
    input.successful !== false
  ) {
    throw new OnboardingDomainError(
      "invalid_first_test_result",
      "completed first test requires a boolean successful result",
    );
  }
  return {
    id: requireText(input.id, "firstTest.id"),
    status,
    successful: status === "completed" ? successful : false,
    usageEventId:
      input.usageEventId === null || input.usageEventId === undefined
        ? null
        : requireText(input.usageEventId, "firstTest.usageEventId"),
  };
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
