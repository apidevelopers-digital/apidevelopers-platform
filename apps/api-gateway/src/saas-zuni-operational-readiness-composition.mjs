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

  const adapter = createZuniOperationalReadinessAdapter({\n    async probeTenant(request) {\n      const tenant = await runtime.getTenant(request.tenantId);\n      if (!tenant) return { ready: false, code: "tenant_not_found" };\n      return { ready: tenant.status === "active", tenantId: tenant.tenantId, status: tenant.status, source: "saas.runtime.tenants"};\n    },\n    async probeWorkspace(request) {\n      const workspace = await runtime.getWorkspace(request.workspaceId);\n      if (!workspace) return { ready: false, code: "workspace_not_found" };\n      return { ready: workspace.status === "active", workspaceId: workspace.workspaceId, tenantId: workspace.tenantId, productId: workspace.productId, status: workspace.status, source: "saas.runtime.workspaces" };\n    },\n    async probeProduct(request) {\n      const result = await probeProduct(request);\n      if (!result || typeof result !== "object") return { ready: false, code: "invalid_product_probe" };\n      return { ...result, ready: result.ready === true, source: result.source ?? "zuni.product.readiness" };\n    },\n  });

  return Object.freeze({ adapter });
}
