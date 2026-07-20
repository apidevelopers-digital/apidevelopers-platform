import assert from "node:assert/strict";
import test from "node:test";
import {
  T1,
  account,
  apiKey,
  documentation,
  firstTestCompleted,
  firstTestRequested,
  request,
  service,
  start,
  workspace,
} from "./helpers.mjs";

test("enforces the canonical step order", () => {
  const s = service();
  start(s);
  assert.throws(
    () =>
      s.recordWorkspaceReady({
        onboardingId: "onboarding-1",
        sourceEventId: "workspace-early",
        tenantId: "tenant-1",
        projectId: "project-1",
      }),
    (error) => error.code === "invalid_onboarding_step",
  );
  const confirmed = s.recordAccountConfirmed({
    onboardingId: "onboarding-1",
    sourceEventId: "account-confirmed-ok",
    accountId: "account-1",
  });
  assert.equal(confirmed.snapshot.currentStep, "workspace");
});

test("stores only API key id and public prefix", () => {
  const s = service();
  workspace(s);
  const ready = s.recordApiKeyReady({
    onboardingId: "onboarding-1",
    sourceEventId: "apikey-ready-1",
    apiKeyId: "apikey-1",
    prefix: "apid_live_abc",
    deliveryRecorded: true,
  });
  assert.deepEqual(ready.snapshot.apiKey, {
    id: "apikey-1",
    prefix: "apid_live_abc",
    status: "ready",
    deliveryRecorded: true,
  });
  assert.equal("secret" in ready.snapshot.apiKey, false);
});

test("requires opened documentation before first test", () => {
  const s = service();
  apiKey(s);
  assert.throws(
    () =>
      s.requestFirstTest({
        onboardingId: "onboarding-1",
        sourceEventId: "first-test-early",
        firstTestId: "first-test-1",
      }),
    (error) => error.code === "invalid_onboarding_step",
  );
  const opened = s.recordDocumentationOpened({
    onboardingId: "onboarding-1",
    sourceEventId: "documentation-opened-ok",
    documentId: "quickstart-v1",
  });
  assert.equal(opened.snapshot.currentStep, "first_test");
});

test("completes only after a successful first test", () => {
  const s = service();
  firstTestCompleted(s, true);
  const completed = s.completeOnboarding({
    onboardingId: "onboarding-1",
    sourceEventId: "onboarding-completed-1",
    completedAt: T1,
  });
  assert.equal(completed.snapshot.status, "completed");
  assert.equal(completed.snapshot.completedAt, T1);
  assert.equal(completed.events[0].type, "onboarding.completed");
  assert.equal(completed.events[0].data.usageEventId, "usage-event-1");
});

test("keeps unsuccessful first test in progress and deduplicates events", () => {
  const s = service();
  firstTestRequested(s);
  const first = s.completeFirstTest({
    onboardingId: "onboarding-1",
    sourceEventId: "first-test-completed-failed",
    firstTestId: "first-test-1",
    usageEventId: "usage-event-failed",
    successful: false,
  });
  const repeated = s.completeFirstTest({
    onboardingId: "onboarding-1",
    sourceEventId: "first-test-completed-failed",
    firstTestId: "first-test-1",
    usageEventId: "usage-event-failed",
    successful: false,
  });
  assert.equal(first.snapshot.currentStep, "first_test");
  assert.equal(first.snapshot.firstTest.successful, false);
  assert.equal(repeated.appended, false);
  assert.deepEqual(repeated.events, []);
  assert.throws(
    () =>
      s.completeOnboarding({
        onboardingId: "onboarding-1",
        sourceEventId: "complete-early",
      }),
    (error) => error.code === "invalid_onboarding_step",
  );
});

test("fails and retries from the failed step", () => {
  const s = service();
  account(s);
  const failed = s.failOnboarding({
    onboardingId: "onboarding-1",
    sourceEventId: "onboarding-failed-1",
    code: "workspace_timeout",
    message: "workspace readiness timed out",
    step: "workspace",
    retryable: true,
  });
  assert.equal(failed.snapshot.status, "failed");
  const retried = s.retryOnboarding({
    onboardingId: "onboarding-1",
    sourceEventId: "onboarding-retry-1",
  });
  assert.equal(retried.snapshot.status, "running");
  assert.equal(retried.snapshot.currentStep, "workspace");
  assert.equal(retried.snapshot.attempt, 2);
});

test("cancels non-terminal onboarding and blocks later transitions", () => {
  const s = service();
  request(s);
  const cancelled = s.cancelOnboarding({
    onboardingId: "onboarding-1",
    sourceEventId: "onboarding-cancelled-1",
    reason: "customer_request",
    at: T1,
  });
  assert.equal(cancelled.snapshot.status, "cancelled");
  assert.throws(
    () =>
      s.startOnboarding({
        onboardingId: "onboarding-1",
        sourceEventId: "start-after-cancel",
      }),
    (error) => error.code === "terminal_onboarding",
  );
});
