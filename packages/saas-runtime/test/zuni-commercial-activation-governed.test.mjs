import test from "node:test";
import assert from "node:assert/strict";

import { createZuniActivationPlan } from "../src/zuni-commercial-activation.mjs";
import {
  executeZuniActivationPlan,
  ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION,
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

function createActivationPlan() {
  return createZuniActivationPlan({
    plan,
    tenantSlug: "zuni-preview",
    tenantDisplayName: "Zuni Preview",
    organizationId: "component.organization.zuni-preview",
    workspaceSlug: "preview-main",
    workspaceDisplayName: "Zuni Preview Main",
    createdAt: "2026-08-25T22:50:00.000Z",
  });
}

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
      state.calls.push(`grantEntitlement:${record.entitlementId}`);
      state.entitlements.set(record.entitlementId, record);
      return record;
    },
    async enqueueProvisioning(job) {
      state.calls.push("enqueueProvisioning");
      state.job = job;
      return { executed: true, job };
    },
    async getTenant() {
      return state.tenant;
    },
    async getWorkspace() {
      return state.workspace;
    },
    async getSubscription() {
      return state.subscription;
    },
    async getEntitlement(id) {
      return state.entitlements.get(id) ?? null;
    },
    async getProvisioningJob() {
      return state.job;
    },
  };
}

test("Zuni commercial activation dry-run never writes", async () => {
  const activationPlan = createActivationPlan();
  const runtime = fakeRuntime();
  const events = [];

  const result = await executeZuniActivationPlan({
    runtime,
    activationPlan,
    audit: async (event) => events.push(event),
    mode: "dry-run",
    requestedAt: "2026-08-25T22:51:00.000Z",
  });

  assert.equal(activationPlan.planId, "pro");
  assert.equal(activationPlan.productionWriteAuthorized, false);
  assert.equal(activationPlan.automaticCharge, false);
  assert.equal(result.executed, false);
  assert.equal(result.writeAuthorized, false);
  assert.deepEqual(runtime.state.calls, []);
  assert.equal(events.length, 1);
  assert.equal(events[0].stage, "dry-run");
  assert.equal(events[0].outcome, "planned");
});

test("Zuni commercial activation write rejects missing authorization", async () => {
  const activationPlan = createActivationPlan();
  const runtime = fakeRuntime();

  await assert.rejects(
    executeZuniActivationPlan({
      runtime,
      activationPlan,
      audit: async () => {},
      mode: "write",
      requestedAt: "2026-08-25T22:52:00.000Z",
    }),
    /write authorization is required/,
  );

  assert.deepEqual(runtime.state.calls, []);
});

test("Zuni commercial activation governed write is idempotent across provisioning lifecycle", async () => {
  const activationPlan = createActivationPlan();
  const runtime = fakeRuntime();
  const events = [];

  const first = await executeZuniActivationPlan({
    runtime,
    activationPlan,
    audit: async (event) => events.push(event),
    mode: "write",
    authorization: ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION,
    requestedAt: "2026-08-25T22:53:00.000Z",
  });

  assert.equal(first.executed, true);
  assert.equal(first.writeAuthorized, true);
  assert.equal(first.result.tenantCreated, true);
  assert.equal(first.result.workspaceCreated, true);
  assert.equal(first.result.subscriptionCreated, true);
  assert.equal(first.result.entitlementsCreated, activationPlan.entitlements.length);
  assert.equal(first.result.provisioningEnqueued, true);
  assert.equal(runtime.state.subscription.status, "assisted_activation");
  assert.equal(runtime.state.job.status, "queued");

  const firstCalls = [...runtime.state.calls];
  assert.ok(firstCalls.includes("registerTenantWorkspace"));
  assert.ok(firstCalls.includes("startSubscription"));
  assert.ok(firstCalls.includes("enqueueProvisioning"));
  assert.equal(
    firstCalls.filter((call) => call.startsWith("grantEntitlement:")).length,
    activationPlan.entitlements.length,
  );

  runtime.state.job = {
    ...runtime.state.job,
    status: "running",
    attempt: 1,
    startedAt: "2026-08-25T22:53:30.000Z",
  };
  runtime.state.calls.length = 0;

  const second = await executeZuniActivationPlan({
    runtime,
    activationPlan,
    audit: async (event) => events.push(event),
    mode: "write",
    authorization: ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION,
    requestedAt: "2026-08-25T22:54:00.000Z",
  });

  assert.equal(second.executed, true);
  assert.equal(second.result.tenantCreated, false);
  assert.equal(second.result.workspaceCreated, false);
  assert.equal(second.result.subscriptionCreated, false);
  assert.equal(second.result.entitlementsCreated, 0);
  assert.equal(second.result.provisioningEnqueued, false);
  assert.equal(second.result.provisioning.job.status, "running");
  assert.deepEqual(runtime.state.calls, []);

  assert.deepEqual(
    events.map(({ stage, outcome }) => ({ stage, outcome })),
    [
      { stage: "write", outcome: "started" },
      { stage: "write", outcome: "persisted" },
      { stage: "write", outcome: "started" },
      { stage: "write", outcome: "persisted" },
    ],
  );
});

test("Zuni commercial activation rejects conflicting provisioning identity", async () => {
  const activationPlan = createActivationPlan();
  const runtime = fakeRuntime();

  await executeZuniActivationPlan({
    runtime,
    activationPlan,
    audit: async () => {},
    mode: "write",
    authorization: ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION,
    requestedAt: "2026-08-25T22:55:00.000Z",
  });

  runtime.state.job = {
    ...runtime.state.job,
    idempotencyKey: "zuni-activation:conflicting-request",
    status: "running",
    attempt: 1,
  };
  runtime.state.calls.length = 0;

  await assert.rejects(
    executeZuniActivationPlan({
      runtime,
      activationPlan,
      audit: async () => {},
      mode: "write",
      authorization: ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION,
      requestedAt: "2026-08-25T22:56:00.000Z",
    }),
    /conflicting identity/,
  );

  assert.deepEqual(runtime.state.calls, []);
});
