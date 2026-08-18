import { createUnavailableZuniProductProvisioner } from "./saas-zuni-product-provisioner.mjs";

function requireRuntime(runtime) {
  if (!runtime || typeof runtime.getProvisioningJob !== "function" || typeof runtime.completeProvisioning !== "function") {
    throw new TypeError("saasRuntime with getProvisioningJob and completeProvisioning is required");
  }
  return runtime;
}

export function createZuniProvisioningRuntimeGuard({
  saasRuntime,
  zuniProductProvisioner = createUnavailableZuniProductProvisioner(),
} = {}) {
  const runtime = requireRuntime(saasRuntime);
  if (!zuniProductProvisioner || typeof zuniProductProvisioner.provision !== "function") {
    throw new TypeError("zuniProductProvisioner.provision must be a function");
  }

  return Object.freeze({
    ...runtime,
    async completeProvisioning({ provisioningJobId, at, result } = {}) {
      const job = await runtime.getProvisioningJob(provisioningJobId);
      if (!job) throw new Error("provisioning_job_not_found");

      if (job.productId !== "zuni") {
        return runtime.completeProvisioning({ provisioningJobId, at, result });
      }

      const evidence = await zuniProductProvisioner.provision({
        productId: job.productId,
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
        subscriptionId: job.subscriptionId,
        provisioningJobId: job.provisioningJobId,
        idempotencyKey: job.idempotencyKey,
        entitlementIds: job.entitlementIds ?? [],
      });

      return runtime.completeProvisioning({
        provisioningJobId,
        at,
        result: {
          tenantReady: evidence.tenantReady,
          workspaceReady: evidence.workspaceReady,
          productReady: evidence.productReady,
          evidenceId: evidence.evidenceId,
          mode: evidence.mode,
        },
      });
    },
  });
}
