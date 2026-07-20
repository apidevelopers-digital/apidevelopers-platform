import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryOnboardingRepository,
  createOnboardingSnapshot,
} from "../src/index.mjs";
import {
  T0,
  activationEvent,
  request,
  service,
} from "./helpers.mjs";

test("creates immutable snapshots and rejects sensitive metadata", () => {
  const snapshot = createOnboardingSnapshot({
    snapshotId: "snapshot-1",
    onboardingId: "onboarding-1",
    revision: 1,
    activation: {
      id: "activation-1",
      accountId: "account-1",
      checkoutId: "checkout-1",
      subscriptionId: "subscription-1",
      provisioningId: "provisioning-1",
      completed: true,
    },
    status: "requested",
    attempt: 0,
    currentStep: "account",
    account: null,
    workspace: null,
    apiKey: null,
    documentation: null,
    firstTest: null,
    failure: null,
    sourceEventId: "event-1",
    previousSnapshotId: null,
    createdAt: T0,
    completedAt: null,
    endedAt: null,
    metadata: { campaign: { id: "launch" } },
  });
  assert.throws(() => {
    snapshot.metadata.campaign.id = "changed";
  }, TypeError);
  assert.throws(
    () => request(service(), { metadata: { apiKeySecret: "forbidden" } }),
    (error) => error.code === "sensitive_data_forbidden",
  );
});

test("requires activation.completed", () => {
  assert.throws(
    () =>
      request(service(), {
        activationEvent: activationEvent({
          type: "activation.started",
        }),
      }),
    (error) => error.code === "unsupported_activation_event",
  );
});

test("creates one idempotent onboarding per activation", () => {
  const s = service();
  const first = request(s);
  const repeated = request(s, {
    onboardingId: "onboarding-2",
    sourceEventId: "activation-completed-2",
  });
  assert.equal(first.snapshot.status, "requested");
  assert.equal(repeated.appended, false);
  assert.equal(repeated.snapshot.onboardingId, "onboarding-1");
});

test("repository is append-only, sequential and source-event idempotent", () => {
  const repo = createMemoryOnboardingRepository();
  const first = request(service()).snapshot;
  assert.equal(repo.append(first).appended, true);
  assert.equal(
    repo.append({ ...first, snapshotId: "other" }).appended,
    false,
  );
  assert.throws(
    () =>
      repo.append({
        ...first,
        snapshotId: "snapshot-x",
        sourceEventId: "event-x",
        revision: 3,
      }),
    (error) => error.code === "invalid_onboarding_revision",
  );
});
