import { createHash } from "node:crypto";

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

function canonicalHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertReady(probe, name) {
  const value = requireObject(probe, name);
  if (value.ready !== true) {
    throw new Error(`${name}_not_ready`);
  }
  return value;
}

export function createZuniOperationalReadinessAdapter({
  probeTenant,
  probeWorkspace,
  probeProduct,
} = {}) {
  const tenantProbe = requireFunction(probeTenant, "probeTenant");
  const workspaceProbe = requireFunction(probeWorkspace, "probeWorkspace");
  const productProbe = requireFunction(probeProduct, "probeProduct");

  return Object.freeze({
    async provision(input = {}) {
      requireObject(input, "input");
      const productId = requireText(input.productId, "input.productId").toLowerCase();
      if (productId !== "zuni") {
        throw new Error(`unsupported_product:${productId}`);
      }

      const request = Object.freeze({
        productId,
        tenantId: requireText(input.tenantId, "input.tenantId"),
        workspaceId: requireText(input.workspaceId, "input.workspaceId"),
        subscriptionId: requireText(input.subscriptionId, "input.subscriptionId"),
        provisioningJobId: requireText(input.provisioningJobId, "input.provisioningJobId"),
        idempotencyKey: requireText(input.idempotencyKey, "input.idempotencyKey"),
        entitlementIds: Object.freeze([...(input.entitlementIds ?? [])]),
      });

      const [tenant, workspace, product] = await Promise.all([
        tenantProbe(request),
        workspaceProbe(request),
        productProbe(request),
      ]);

      const tenantEvidence = assertReady(tenant, "tenant");
      const workspaceEvidence = assertReady(workspace, "workspace");
      const productEvidence = assertReady(product, "product");

      if (tenantEvidence.tenantId && tenantEvidence.tenantId !== request.tenantId) {
        throw new Error("tenant_id_mismatch");
      }
      if (workspaceEvidence.workspaceId && workspaceEvidence.workspaceId !== request.workspaceId) {
        throw new Error("workspace_id_mismatch");
      }
      if (workspaceEvidence.tenantId && workspaceEvidence.tenantId !== request.tenantId) {
        throw new Error("workspace_tenant_mismatch");
      }

      const evidencePayload = Object.freeze({
        productId: request.productId,
        tenantId: request.tenantId,
        workspaceId: request.workspaceId,
        provisioningJobId: request.provisioningJobId,
        tenant: tenantEvidence,
        workspace: workspaceEvidence,
        product: productEvidence,
      });

      return Object.freeze({
        tenantReady: true,
        workspaceReady: true,
        productReady: true,
        evidenceId: `evidence:zuni:readiness:${canonicalHash(evidencePayload)}`,
        mode: "zuni_operational_readiness",
      });
    },
  });
}
