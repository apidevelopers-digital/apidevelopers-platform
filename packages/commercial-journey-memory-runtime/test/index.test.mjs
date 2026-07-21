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

test("defaults disabled and exposes no live capability", async () => {
  const runtime = createCommercialJourneyMemoryRuntime();
  assert.equal(runtime.enabled, false);
  assert.equal(runtime.liveAllowed, false);
  assert.equal(runtime.deployAllowed, false);
  assert.equal(runtime.externalPublicationAllowed, false);
  await assert.rejects(runtime.execute(input), (error) =>
    error?.code === "COMMERCIAL_JOURNEY_DISABLED");
});

test("executes the eight-step in-memory journey", async () => {
  const result = await createCommercialJourneyMemoryRuntime({ enabled: true }).execute(input);
  assert.equal(result.status, "completed");
  assert.equal(result.events.length, 8);
  assert.equal(result.payment.snapshot.status, "completed");
  assert.equal(result.subscription.snapshot.status, "active");
  assert.equal(result.apiKey.provisioning.status, "completed");
  assert.equal(result.firstRequest.statusCode, 200);
  assert.equal(result.firstRequest.authorization.status, "authorized");
  assert.equal(result.firstRequest.completion.status, "completed");
  assert.equal(result.liveAllowed, false);
  assert.equal(result.deployAllowed, false);
  assert.equal(result.externalPublicationAllowed, false);
});

test("does not return the raw API key or hash", async () => {
  const result = await createCommercialJourneyMemoryRuntime({ enabled: true }).execute(input);
  const serialized = JSON.stringify(result);
  const rawKey = generateApiKey({ randomBytesFactory: () => Buffer.alloc(24, 7) });
  assert.equal(serialized.includes(rawKey), false);
  assert.equal(serialized.includes('"hash"'), false);
  assert.equal("hash" in result.apiKey.record, false);
});

test("fails closed on payment mismatch", async () => {
  const runtime = createCommercialJourneyMemoryRuntime({ enabled: true });
  await assert.rejects(
    runtime.execute({ ...input, paymentAmount: 1 }),
    (error) => error?.code === "payment_amount_mismatch",
  );
});
