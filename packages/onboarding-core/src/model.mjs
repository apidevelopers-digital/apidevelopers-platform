import { assertNoSensitiveData, deepFreeze, requireIso, requireText, OnboardingDomainError } from "./common.mjs";

export const ONBOARDING_STATES = Object.freeze(["requested", "running", "completed", "failed", "cancelled"]);
export const ONBOARDING_STEPS = Object.freeze([
  "account_confirmed",
  "tenant_available",
  "project_available",
  "apikey_issued",
  "apikey_delivered",
  "documentation_opened",
  "first_test_requested",
  "first_test_completed",
]);

export function createOnboarding(input) {
  assertNoSensitiveData(input);
  const now = requireIso(input.occurredAt, "occurredAt");
  const activationId = requireText(input.activationId, "activationId");
  const snapshot = {
    id: requireText(input.id, "id"),
    activationId,
    sourceEventId: requireText(input.sourceEventId, "sourceEventId"),
    accountId: requireText(input.accountId, "accountId"),
    productId: requireText(input.productId, "productId"),
    planId: requireText(input.planId, "planId"),
    state: "requested",
    revision: 1,
    steps: Object.fromEntries(ONBOARDING_STEPS.map((step) => [step, null])),
    apiKey: null,
    failure: null,
    createdAt: now,
    updatedAt: now,
    metadata: structuredClone(input.metadata ?? {}),
  };
  return deepFreeze(snapshot);
}

export function assertTransition(snapshot, nextState) {
  const allowed = {
    requested: ["running", "cancelled"],
    running: ["completed", "failed", "cancelled"],
    failed: ["running", "cancelled"],
    completed: [],
    cancelled: [],
  };
  if (!ONBOARDING_STATES.includes(nextState) || !allowed[snapshot.state].includes(nextState)) {
    throw new OnboardingDomainError("invalid_transition", `cannot transition ${snapshot.state} to ${nextState}`);
  }
}

export function evolve(snapshot, changes, occurredAt) {
  if (changes.apiKey) {
    const keys = Object.keys(changes.apiKey);
    if (keys.some((key) => !["apiKeyId", "prefix"].includes(key))) {
      throw new OnboardingDomainError("sensitive_data_forbidden", "apiKey may contain only apiKeyId and prefix");
    }
    assertNoSensitiveData({ apiKeyMetadata: changes.apiKey });
  }
  const nonCredentialChanges = structuredClone(changes);
  delete nonCredentialChanges.apiKey;
  assertNoSensitiveData(nonCredentialChanges);
  const next = {
    ...structuredClone(snapshot),
    ...structuredClone(changes),
    revision: snapshot.revision + 1,
    updatedAt: requireIso(occurredAt, "occurredAt"),
  };
  return deepFreeze(next);
}
