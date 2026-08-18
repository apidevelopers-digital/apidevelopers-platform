import test from "node:test";
import assert from "node:assert/strict";
import { createUnavailableZuniProductProvisioner, createZuniProductProvisioner, zuniProductProvisionerContract } from "../src/saas-zuni-product-provisioner.mjs";

const input = Object.freeze({
  productId: "zuni",
  tenantId: "component.tenant.acme",
  workspaceId: "component.workspace.acme.zuni-main",
  subscriptionId: "component.subscription.acme.zuni",
  provisioningJobId: "component.provisioning.acme.zuni-main.zuni",
  idempotencyKey: "checkout-payment-123",
  entitlementIds: ["component.entitlement.acme.zuni-main.workspace-access"],
});

test("provisioner accepts only explicit operational readiness evidence", async () => {
  let received = null;
  const provisioner = createZuniProductProvisioner({ provision: async (request) => {
    received = request;
    return { tenantReady: true, workspaceReady: true, productReady: true, evidenceId: "evidence:zuni:provisioning:123", mode: "adapter-test" };
  }});
  const result = await provisioner.provision(input);
  assert.equal(received.idempotencyKey, input.idempotencyKey);
  assert.deepEqual(received.entitlementIds, input.entitlementIds);
  assert.deepEqual(result, { tenantReady: true, workspaceReady: true, productReady: true, evidenceId: "evidence:zuni:provisioning:123", mode: "adapter-test" });
});

test("provisioner fails closed when readiness is incomplete", async () => {
  const provisioner = createZuniProductProvisioner({ provision: async () => ({ tenantReady: true, workspaceReady: true, productReady: false, evidenceId: "evidence:zuni:provisioning:incomplete" }) });
  await assert.rejects(() => provisioner.provision(input), /zuni_product_provisioning_incomplete/);
});

test("unavailable adapter never reports provisioning success", async () => {
  await assert.rejects(() => createUnavailableZuniProductProvisioner().provision(input), /zuni_product_provisioner_unavailable/);
});

test("contract is fail-closed", () => {
  assert.equal(zuniProductProvisionerContract.productId, "zuni");
  assert.equal(zuniProductProvisionerContract.failClosedWithoutAdapter, true);
  assert.deepEqual(zuniProductProvisionerContract.completionRequires, ["tenantReady", "workspaceReady", "productReady", "evidenceId"]);
});
