import test from "node:test";
import assert from "node:assert/strict";

import { createZuniProvisioningRuntimeGuard } from "../src/saas-zuni-provisioning-runtime-guard.mjs";

function buildRuntime() {
  const state = {
    job: Object.freeze({
      provisioningJobId: "component.provisioning.acme.zuni-main.zuni",
      subscriptionId: "component.subscription.acme.zuni",
      tenantId: "component.tenant.acme",
      workspaceId: "component.workspace.acme.zuni-main",
      productId: "zuni",
      entitlementIds: Object.freeze(["component.entitlement.acme.zuni-main.workspace-access"]),
      idempotencyKey: "checkout-payment-123",
      status: "running",
    }),
    completed: null,
  };

  return {
    state,
    runtime: {
      getProvisioningJob: async () => state.job,
      completeProvisioning: async (input) => {
        state.completed = Object.freeze({ ...input });
        return Object.freeze({ ...state.job, status: "succeeded", result: input.result });
      },
      getSubscription: async () => null,
    },
  };
}

test("Zuni	provisioning cannot complete without an explicit product adapter", async () => {
  const { runtime, state } = buildRuntime();
  const guarded = createZuniProvisioningRuntimeGuard({ saasRuntime: runtime });

  await assert.rejects(
    () => guarded.completeProvisioning({
      provisioningJobId: state.job.provisioningJobId,
      at: "2026-08-18T03:45:00.000Z",
      result: { tenantReady: true, workspaceReady: true, productReady: true, mode: "shared_saas_runtime" },
    }),
    /zuni_product_provisioner_unavailable/,
   );
  assert.equal(state.completed, null);
});

test("Zuni	provisioning completes only with adapter readiness evidence", async () => {
  const { runtime, state } = buildRuntime();
  const guarded = createZuniProvisioningRuntimeGuard({
    saasRuntime: runtime,
    zuniProductProvisioner: {
      provision: async (request) => {
        assert.equal(request.provisioningJobId, state.job.provisioningJobId);
        assert.equal(request.idempotencyKey, state.job.idempotencyKey);
        return {
          tenantReady: true,
          workspaceReady: true,
          productReady: true,
          evidenceId: "evidence:zuni:provisioning:abc123",
          mode: "zuni_product_adapter",
        };
      },
    },
  });

  const completed = await guarded.completeProvisioning({
    provisioningJobId: state.job.provisioningJobId,
    at: "2026-08-18T03:45:00.000Z",
    result: { tenantReady: true, workspaceReady: true, productReady: true, mode: "shared_saas_runtime" },
  });

  assert.equal(completed.status, "succeeded");
  assert.deepEqual(state.completed.result, {
    tenantReady: true,
    workspaceReady: true,
    productReady: true,
    evidenceId: "evidence:zuni:provisioning:abc123",
    mode: "zuni_product_adapter",
  });
});

test("non-Zuni	provisioning remains delegated to the existing runtime", async () => {
  const { runtime, state } = buildRuntime();
  state.job = Object.freeze({ ...state.job, productId: "other-product" });
  const guarded = createZuniProvisioningRuntimeGuard({ saasRuntime: runtime });
  const requested = { tenantReady: true, workspaceReady: true, productReady: true, mode: "existing_runtime" };

  await guarded.completeProvisioning({
    provisioningJobId: state.job.provisioningJobId,
    at: "2026-08-18T03:45:00.000Z",
    result: requested,
  });

  assert.deepEqual(state.completed.result, requested);
});
