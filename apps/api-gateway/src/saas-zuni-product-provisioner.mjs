const PRODUCT_ID = "zuni";

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  return value;
}
function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}
function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  return value;
}
function normalizeResult(value) {
  const result = requireObject(value, "provisioning result");
  const tenantReady = result.tenantReady === true;
  const workspaceReady = result.workspaceReady === true;
  const productReady = result.productReady === true;
  const evidenceId = requireText(result.evidenceId, "provisioning result.evidenceId");
  if (!tenantReady || !workspaceReady || !productReady) throw new Error("zuni_product_provisioning_incomplete");
  return Object.freeze({ tenantReady, workspaceReady, productReady, evidenceId, mode: requireText(result.mode ?? "zuni_product_adapter", "provisioning result.mode") });
}
export function createZuniProductProvisioner({ provision } = {}) {
  const execute = requireFunction(provision, "provision");
  return Object.freeze({
    async provision(input = {}) {
      requireObject(input, "input");
      const productId = requireText(input.productId, "input.productId").toLowerCase();
      if (productId !== PRODUCT_ID) throw new Error(`unsupported_product:${productId}`);
      const request = Object.freeze({
        productId,
        tenantId: requireText(input.tenantId, "input.tenantId"),
        workspaceId: requireText(input.workspaceId, "input.workspaceId"),
        subscriptionId: requireText(input.subscriptionId, "input.subscriptionId"),
        provisioningJobId: requireText(input.provisioningJobId, "input.provisioningJobId"),
        idempotencyKey: requireText(input.idempotencyKey, "input.idempotencyKey"),
        entitlementIds: Object.freeze([...(input.entitlementIds ?? [])].map((id) => requireText(id, "input.entitlementIds[]"))),
      });
      return normalizeResult(await execute(request));
    },
  });
}
export function createUnavailableZuniProductProvisioner() {
  return Object.freeze({ async provision() { throw new Error("zuni_product_provisioner_unavailable"); } });
}
export const zuniProductProvisionerContract = Object.freeze({
  productId: PRODUCT_ID,
  completionRequires: Object.freeze(["tenantReady", "workspaceReady", "productReady", "evidenceId"]),
  failClosedWithoutAdapter: true,
});
