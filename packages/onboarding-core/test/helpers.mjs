import {
  createOnboardingService,
} from "../src/index.mjs";

export const T0 = "2026-07-20T00:00:00.000Z";
export const T1 = "2026-07-20T01:00:00.000Z";

export function activationEvent(patch = {}) {
  return {
    type: "activation.completed",
    activationId: "activation-1",
    checkoutId: "checkout-1",
    accountId: "account-1",
    data: {
      subscriptionId: "subscription-1",
      provisioningId: "provisioning-1",
      ...patch.data,
    },
    ...patch,
  };
}

export function service() {
  let id = 0;
  let tick = 0;
  return createOnboardingService({
    idFactory: () => `snapshot-${++id}`,
    clock: () =>
      new Date(Date.parse(T0) + tick++ * 1000).toISOString(),
  });
}

export function request(s, patch = {}) {
  return s.requestOnboarding({
    onboardingId: "onboarding-1",
    activationEvent: activationEvent(),
    sourceEventId: "activation-completed-1",
    ...patch,
  });
}

export function start(s) {
  request(s);
  return s.startOnboarding({
    onboardingId: "onboarding-1",
    sourceEventId: "onboarding-started-1",
  });
}

export function account(s) {
  start(s);
  return s.recordAccountConfirmed({
    onboardingId: "onboarding-1",
    sourceEventId: "account-confirmed-1",
    accountId: "account-1",
  });
}

export function workspace(s) {
  account(s);
  return s.recordWorkspaceReady({
    onboardingId: "onboarding-1",
    sourceEventId: "workspace-ready-1",
    tenantId: "tenant-1",
    projectId: "project-1",
  });
}

export function apiKey(s) {
  workspace(s);
  return s.recordApiKeyReady({
    onboardingId: "onboarding-1",
    sourceEventId: "apikey-ready-1",
    apiKeyId: "apikey-1",
    prefix: "apid_live_abc",
    deliveryRecorded: true,
  });
}

export function documentation(s) {
  apiKey(s);
  return s.recordDocumentationOpened({
    onboardingId: "onboarding-1",
    sourceEventId: "documentation-opened-1",
    documentId: "quickstart-v1",
  });
}

export function firstTestRequested(s) {
  documentation(s);
  return s.requestFirstTest({
    onboardingId: "onboarding-1",
    sourceEventId: "first-test-requested-1",
    firstTestId: "first-test-1",
  });
}

export function firstTestCompleted(s, successful = true) {
  firstTestRequested(s);
  return s.completeFirstTest({
    onboardingId: "onboarding-1",
    sourceEventId: "first-test-completed-1",
    firstTestId: "first-test-1",
    usageEventId: "usage-event-1",
    successful,
  });
}
