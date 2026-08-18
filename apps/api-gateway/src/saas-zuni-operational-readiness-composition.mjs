import { createZuniOperationalReadinessAdapter } from "./saas-zuni-operational-readiness-adapter.mjs";

function requireRuntime(runtime) {
  if (!runtime || typeof runtime.getTenant !== "function" || typeof runtime.getWorkspace !== "function") {
    throw new TypeError("saasRuntime with getTenant and getWorkspace is required");
  }
  return runtime;
}

function requireProbe(probe) {
  if (typeof probe !== "function") {
    throw new TypeError("probeZuniProductReadiness must be a function");
  }
  return probe;
}

export function createZuniOperationalReadinessComposition({
  saasRuntime,
  probeZuniProductReadiness,
} = {}) {
  const runtime = requireRuntime(saasRuntime);
  const probeProduct = requireProbe(probeZuniProductReadiness);

  const adapter = createZuniOperationalReadinessAdapter({
    async probeTenant(request) {
      const tenant = await runtime.getTenant(request.tenantId);
      if (!tenant) return { ready: false, code: "tenant_not_found" };
      return {
        ready: tenant.status === "active",
        tenantId: tenant.tenantId,
        status: tenant.status,
        source: "saas.runtime.tenants",
      };
    },

    async probeWorkspace(request) {
      const workspace = await runtime.getWorkspace(request.workspaceId);
      if (!workspace) return { ready: false, code: "workspace_not_found" };
      return {
        ready: workspace.status === "active",
        workspaceId: workspace.workspaceId,
        tenantId: workspace.tenantId,
        productId: workspace.productId,
        status: workspace.status,
        source: "saas.runtime.workspaces",
      };
    },

    async probeProduct(request) {
      const result = await probeProduct(request);
      if (!result || typeof result !== "object") {
        return { ready: false, code: "invalid_product_probe" };
      }
      return {
        ...result,
        ready: result.ready === true,
        source: result.source ?? "zuni.product.readiness",
      };
    },
  });

  return Object.freeze({ adapter });
}
