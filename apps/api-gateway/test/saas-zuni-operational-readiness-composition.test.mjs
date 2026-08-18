import test from "node:test";
import assert from "node:assert/strict";

import { createZuniOperationalReadinessComposition } from "../src/saas-zuni-operational-readiness-composition.mjs";

const input = Object.freeze({
  productId: "zuni",
  tenantId: "component.tenant.acme",
  workspaceId: "component.workspace.acme.zuni-main",
  subscriptionId: "component.subscription.acme.zuni",
  provisioningJobId: "component.provisioning.acme.zuni-main.zuni",
  idempotencyKey: "checkout-123",
  entitlementIds: ["component.entitlement.acme.zuni-main.workspace-access"],
});

test("composes tenant and workspace probes from SaaS runtime plus explicit Zuni product readiness", async () => {
  const calls = [];
  const saasRuntime = {
    async getTenant(id) {
      calls.push(["tenant", id]);
      return { tenantId: id, status: "active" };
    },
    async getWorkspace(id) {
      calls.push(["workspace", id]);
      return { workspaceId: id, tenantId: input.tenantId, productId: "zuni", status: "active" };
    },
  };

  const { adapter } = createZuniOperationalReadinessComposition({
    saasRuntime,
    probeZuniProductReadiness: async (request) => {
      calls.push(["product", request.productId]);
      return { ready: true, source: "zuni-http-readiness", releaseSha: "abc123" };
    },
  });

  const result = await adapter.provision(input);

  assert.equal(result.tenantReady, true);
  assert.equal(result.workspaceReady, true);
  assert.equal(result.productReady, true);
  assert.equal(result.mode, "zuni_operational_readiness");
  assert.match(result.evidenceId, /^evidence:zuni:readiness:[a-f0-9]{64}$/);
  assert.deepEqual(calls, [
    ["tenant", input.tenantId],
    ["workspace", input.workspaceId],
    ["product", "zuni"],
  ]);
});

test("fails closed when tenant is missing", async () => {
  const { adapter } = createZuniOperationalReadinessComposition({
    saasRuntime: {
      async getTenant() { return null; },
      async getWorkspace() {
        return { workspaceId: input.workspaceId, tenantId: input.tenantId, productId: "zuni", status: "active" };
      },
    },
    probeZuniProductReadiness: async () => ({ ready: true }),
  });

  await assert.rejects(() => adapter.provision(input), /tenant_not_ready/);
});

test("fails closed when workspace belongs to another tenant", async () => {
  const { adapter } = createZuniOperationalReadinessComposition({
    saasRuntime: {
      async getTenant(id) { return { tenantId: id, status: "active" }; },
      async getWorkspace(id) {
        return { workspaceId: id, tenantId: "component.tenant.other", productId: "zuni", status: "active" };
      },
    },
    probeZuniProductReadiness: async () => ({ ready: true }),
  });

  await assert.rejects(() => adapter.provision(input), /workspace_tenant_mismatch/);
});

test("fails closed when Zuni product readiness probe is not ready", async () => {
  const { adapter } = createZuniOperationalReadinessComposition({
    saasRuntime: {
      async getTenant(id) { return { tenantId: id, status: "active" }; },
      async getWorkspace(id) {
        return { workspaceId: id, tenantId: input.tenantId, productId: "zuni", status: "active" };
      },
    },
    probeZuniProductReadiness: async () => ({ ready: false, code: "zuni_runtime_unavailable" }),
  });

  await assert.rejects(() => adapter.provision(input), /product_not_ready/);
});

test("composition remains read-only", () => {
  const { adapter } = createZuniOperationalReadinessComposition({
    saasRuntime: {
      async getTenant() { return null; },
      async getWorkspace() { return null; },
    },
    probeZuniProductReadiness: async () => ({ ready: false }),
  });

  assert.equal(typeof adapter.write, "undefined");
  assert.equal(typeof adapter.create, "undefined");
  assert.equal(typeof adapter.mutate, "undefined");
});
