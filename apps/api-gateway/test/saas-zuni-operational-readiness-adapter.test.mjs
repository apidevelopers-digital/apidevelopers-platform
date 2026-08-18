import test from "node:test";
import assert from "node:assert/strict";
import { createZuniOperationalReadinessAdapter } from "../src/saas-zuni-operational-readiness-adapter.mjs";

const input = Object.freeze({
  productId: "zuni",
  tenantId: "component.tenant.acme",
  workspaceId: "component.workspace.acme.zuni-main",
  subscriptionId: "component.subscription.acme.zuni",
  provisioningJobId: "component.provisioning.acme.zuni-main.zuni",
  idempotencyKey: "checkout-123",
  entitlementIds: ["component.entitlement.acme.zuni-main.workspace-access"],
});

test("emits deterministic evidence only when all readiness probes pass", async () => {
  const adapter = createZuniOperationalReadinessAdapter({
    probeTenant: async () => ({ ready: true, tenantId: input.tenantId, source: "saas-runtime" }),
    probeWorkspace: async () => ({ ready: true, workspaceId: input.workspaceId, tenantId: input.tenantId, source: "saas-runtime" }),
    probeProduct: async () => ({ ready: true, runtime: "zuni", source: "http-readiness" }),
  });

  const first = await adapter.provision(input);
  const second = await adapter.provision(input);

  assert.equal(first.tenantReady, true);
  assert.equal(first.workspaceReady, true);
  assert.equal(first.productReady, true);
  assert.match(first.evidenceId, /^evidence:zuni:readiness:[a-f0-9]{64}$/);
  assert.equal(first.evidenceId, second.evidenceId);
  assert.equal(first.mode, "zuni_operational_readiness");
});

test("fails closed when workspace is not ready", async () => {
  const adapter = createZuniOperationalReadinessAdapter({
    probeTenant: async () => ({ ready: true, tenantId: input.tenantId }),
    probeWorkspace: async () => ({ ready: false, workspaceId: input.workspaceId }),
    probeProduct: async () => ({ ready: true }),
  });

  await assert.rejects(() => adapter.provision(input), /workspace_not_ready/);
});

test("fails closed on tenant or workspace id mismatch", async () => {
  const adapter = createZuniOperationalReadinessAdapter({
    probeTenant: async () => ({ ready: true, tenantId: "component.tenant.other" }),
    probeWorkspace: async () => ({ ready: true, workspaceId: input.workspaceId, tenantId: input.tenantId }),
    probeProduct: async () => ({ ready: true }),
  });

  await assert.rejects(() => adapter.provision(input), /tenant_id_mismatch/);
});

test("does not expose a write surface", () => {
  const adapter = createZuniOperationalReadinessAdapter({
    probeTenant: async () => ({ ready: true }),
    probeWorkspace: async () => ({ ready: true }),
    probeProduct: async () => ({ ready: true }),
  });

  assert.equal(typeof adapter.write, "undefined");
  assert.equal(typeof adapter.create, "undefined");
  assert.equal(typeof adapter.mutate, "undefined");
});
