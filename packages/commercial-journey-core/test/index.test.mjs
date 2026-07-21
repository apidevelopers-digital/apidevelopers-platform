import test from "node:test";
import assert from "node:assert/strict";

import {
  CommercialJourneyError,
  createCommercialJourney,
} from "../src/index.mjs";

function adapters(log, failAt) {
  return Object.fromEntries(
    [
      ["registerCustomer", { customerId: "cus_test_1" }],
      ["selectPlan", { planId: "starter_test" }],
      ["createCheckoutSession", { checkoutId: "chk_test_1", providerMode: "test" }],
      ["confirmPayment", { paymentId: "pay_test_1", status: "confirmed_test" }],
      ["activateSubscription", { subscriptionId: "sub_test_1", status: "active_test" }],
      ["provisionWorkspace", { tenantId: "tenant_test_1", projectId: "project_test_1" }],
      ["issueApiKey", { keyId: "key_test_1", revealedOnce: true }],
      ["invokeFirstRequest", { status: 200, requestId: "req_test_1" }],
    ].map(([name, value]) => [
      name,
      async () => {
        log.push(name);
        return name === failAt ? { ok: false } : { ok: true, value };
      },
    ]),
  );
}

test("is disabled by default", async () => {
  const journey = createCommercialJourney({ adapters: adapters([]) });
  await assert.rejects(
    journey.execute({ email: "owner@example.invalid" }),
    (error) =>
      error instanceof CommercialJourneyError &&
      error.code === "COMMERCIAL_JOURNEY_DISABLED",
  );
  assert.equal(journey.liveAllowed, false);
  assert.equal(journey.externalPublicationAllowed, false);
});

test("orchestrates registration through first API request in order", async () => {
  const log = [];
  const journey = createCommercialJourney({
    adapters: adapters(log),
    enabled: true,
  });

  const result = await journey.execute({
    email: "owner@example.invalid",
    requestedPlan: "starter_test",
  });

  assert.deepEqual(log, [...journey.steps]);
  assert.equal(result.status, "completed");
  assert.equal(result.checkout.providerMode, "test");
  assert.equal(result.apiKey.revealedOnce, true);
  assert.equal(result.firstRequest.status, 200);
  assert.equal(result.liveAllowed, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.workspace), true);
});

test("fails closed and never executes later steps", async () => {
  const log = [];
  const journey = createCommercialJourney({
    adapters: adapters(log, "confirmPayment"),
    enabled: true,
  });

  await assert.rejects(
    journey.execute({ email: "owner@example.invalid" }),
    (error) =>
      error instanceof CommercialJourneyError &&
      error.code === "COMMERCIAL_JOURNEY_STEP_FAILED" &&
      error.details.step === "confirmPayment",
  );

  assert.deepEqual(log, [
    "registerCustomer",
    "selectPlan",
    "createCheckoutSession",
    "confirmPayment",
  ]);
});
