import test from "node:test";
import assert from "node:assert/strict";

import {
  createZuniActivationPlan,
} from "../src/zuni-commercial-activation.mjs";
import {
  executeZuniActivationPlan,
} from "../src/zuni-commercial-activation-runtime.mjs";

const plan = Object.freeze({
  id: "pro",
  product_id: "zuni",
  commercial_state: "active",
  pricing_status: "published",
  sellable: true,
  pricing: Object.freeze({
    monthly_cents: 9900,
  }),
  capabilities: Object.freeze({
    inbox: true,
    templates: true,
    meta: true,
  }),
  limits: Object.freeze({
    whatsapp_channels: 2,
    users: 10,
  }),
});

function fakeRuntime() {
  const state = {
    tenant: null,
    workspace: null,
    subscription: null,
    entitlements: new Map(),
    job: null,
    calls: [],
  };

  return {
    state,
    async registerTenantWorkspace({ tenant, workspace }) {
      state.calls.push("registerTenantWorkspace");
      state.tenant = tenant;
      state.workspace = workspace;
      return { tenant, workspace };
    },
    async startSubscription(subscription) {
      state.calls.push("startSubscription");
      state.subscription = subscription;
      return subscription;
    },
    async grantEntitlement(record) {
      state.calls.push("grantEntitlement");
      state.entitlements.set(record.entitlementId, record);
      return record;
    },
    async enqueueProvisioning(job) {
      state.calls.push("enqueueProvisioning");
      state.job = job;
      return { executed: true, job };
    },
    async getTenant() { return state.tenant; },
    async getWorkspace() { return state.workspace; },
    async getSubscription() { return state.subscription; },
    async getEntitlement(id) { return state.entitlements.get(id) ?? null; },
    async getProvisioningJob() { return state.job; },
  };
}

test("Zuni preview tenant activation is safe in dry-run", async () => {
  const activationPlan = createZuniActivationPlan({
    plan,
    tenantSlug: "zuni-preview",
    tenantDisplayName: "Zuni Preview",
    organizationId: "component.organization.zuni-preview",
    workspaceSlug: "preview-main",
    workspaceDisplayName: "Zuni Preview Main",
    createdAt: "2026-08-21T09:20:00.000Z",
  });

  assert.equal(activationPlan.planId, "pro");
  assert.equal(activationPlan.productionWriteAuthorized, false);
  assert.equal(activationPlan.automaticCharge, false);

  const channelLimit = activationPlan.entitlements.find(
    (entitlement) => entitlement?.record?.capability === "limit-whatsapp-channels",
  );
  assert.ok(channelLimit);
  assert.equal(channelLimit.value, 2);

  const runtime = fakeRuntime();
  const result = await executeZuniActivationPlan({
    runtime,
    activationPlan,
    audit: async () => {},
    mode: "dry-run",
    requestedAt: "2026-08-21T09:21:00.000Z",
  });

  assert.equal(result.executed, false);
  assert.equal(result.writeAuthorized, false);
  assert.equal(result.executionPlan.productionWriteAuthorized, false);
  assert.equal(result.executionPlan.automaticCharge, false);
  assert.deepEqual(runtime.state.calls, []);
});
