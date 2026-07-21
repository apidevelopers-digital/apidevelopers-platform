import test from "node:test";
import assert from "node:assert/strict";

import { createCommercialMemoryRuntime } from "../src/index.mjs";

test("runs cadastro through first request with real checkout-core contract", async () => {
  const runtime = createCommercialMemoryRuntime({ enabled: true });
  const result = await runtime.execute({
    email: "owner@example.invalid",
    requestedPlan: "developer_test",
  });

  assert.equal(result.status, "completed");
  assert.equal(result.checkout.providerMode, "memory_test");
  assert.equal(result.payment.snapshot.status, "completed");
  assert.equal(result.subscription.status, "active_test");
  assert.equal(result.workspace.status, "provisioned_test");
  assert.equal(result.apiKey.revealedOnce, true);
  assert.equal(result.firstRequest.status, 200);
  assert.deepEqual(runtime.stats(), {
    customers: 1,
    subscriptions: 1,
    workspaces: 1,
    keys: 1,
  });
  assert.equal(runtime.liveAllowed, false);
  assert.equal(runtime.deployAllowed, false);
});

test("is disabled by default", async () => {
  const runtime = createCommercialMemoryRuntime();
  await assert.rejects(runtime.execute({ email: "x@example.invalid" }, () => true);
  assert.equal(runtime.paymentMode, "memory_test");
});
