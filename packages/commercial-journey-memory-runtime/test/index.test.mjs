import assert from "node:assert/strict";
import test from "node:test";

import { generateApiKey } from "@apidevelopers/apikey-core";
import { createCommercialJourneyMemoryRuntime } from "../src/index.mjs";

const input = Object.freeze({
  email: "cliente@example.com",
  displayName: "Cliente Exemplo",
  planId: "developer",
  tenantName: "Cliente Exemplo",
  tenantSlug: "cliente-exemplo",
  projectName: "Production",
  projectSlug: "production",
});

test("is disabled by default and exposes no live capability", async () => {
  const runtime = createCommercialJourneyMemoryRuntime();

  assert.equal(runtime.enabled, false);
  assert.equal(runtime.liveAllowed, false);
  assert.equal(runtime.deployAllowed, false);
  assert.equal(runtime.externalPublicationAllowed, false);

  await assert.rejects(
    runtime.execute(input),
    (error) => error?.code === "COMMERCIAL_JOURNEY_DISABLED",
  );
});

test("executes the eight-step commercial journey with real in-memory cores", async () => {
  const runtime = createCommercialJourneyMemoryRuntime({ enabled: true });
  const result = await runtime.execute(input);

  assert.equal(result.status, "completed");
  assert.equal(result.events.length, 8);
  assert.deepEqual(
    result.events.map(({ step }) => step),
    [
      "registerCustomer",
      "selectPlan",
      "createCheckoutSession",
      "confirmPayment",
      "activateSubscription",
      "provisionWorkspace",
      "issueApiKey",
      "invokeFirstRequest",
    ],
  );
  assert.equal(result.customer.status, "active");
  assert.equal(result.checkout.snapshot.status, "pending");
  assert.equal(result.payment.snapshot.status, "completed");
  assert.equal(result.subscription.snapshot.status, "active");
  assert.equal(result.workspace.tenant.status, "provisioning");
  assert.equal(result.workspace.project.status, "creating");
  assert.equal(result.apiKey.provisioning.status, "completed");
  assert.equal(result.firstRequest.statusCode, 200);
  assert.equal(result.firstRequest.authorization.status, "authorized");
  assert.equal(result.firstRequest.completion.status, "completed");
  assert.equal(result.liveAllowed, false);
  assert.equal(result.deployAllowed, false);
  assert.equal(result.externalPublicationAllowed, false);
});

test("does not persist or return the raw API key or its hash", async () => {
  const runtime = createCommercialJourneyMemoryRuntime({ enabled: true });
  const result = await runtime.execute(input);
  const serialized = JSON.stringify(result);
  const deterministicRawKey = generateApiKey({
    randomBytesFactory: () => Buffer.alloc(24, 7),
  });

  assert.equal(serialized.includes(deterministicRawKey), false);
  assert.equal(serialized.includes('"hash"'), false);
  assert.equal("hash" in result.apiKey.record, false);
});

test("fails closed on payment mismatch before provisioning resources", async () => {
  const runtime = createCommercialJourneyMemoryRuntime({ enabled: true });

  await assert.rejects(
    runtime.execute({ ...input paymentAmount: 1 }),
    (error) => {
      assert.equal(error?.code, "payment_amount_mismatch");
      return true;
    },
  );
});
