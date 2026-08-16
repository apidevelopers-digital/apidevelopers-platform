import test from "node:test";
import assert from "node:assert/strict";
import {
  buildZuniActivationExecutionPlan,
  executeZuniActivationPlan,
  ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION,
} from "../src/zuni-commercial-activation-runtime.mjs";

function activationFixture() {
  return {
    schemaVersion: 1,
    productId: "zuni",
    planId: "start",
    correlationId: "component.correlation.zuni.acme.start",
    productionWriteAuthorized: false,
    automaticCharge: false,
    tenant: {
      schemaVersion: 1,
      tenantId: "component.tenant.acme",
      organizationId: "component.organization.acme",
      slug: "acme",
      displayName: "Acme",
      status: "active",
      createdAt: "2026-08-16T09:20:00.000Z",
    },
    workspace: {
      schemaVersion: 1,
      workspaceId: "component.workspace.acme.principal",
      tenantId: "component.tenant.acme",
      productId: "zuni",
      slug: "principal",
      displayName: "Principal",
      status: "active",
      createdAt: "2026-08-16T09:20:00.000Z",
    },
    subscription: {
      schemaVersion: 1,
      subscriptionId: "component.subscription.acme.zuni",
      tenantId: "component.tenant.acme",
      productId: "zuni",
      planId: "start",
      status: "assisted_activation",
      currency: "BRL",
      monthlyAmount: 297,
      createdAt: "2026-08-16T09:20:00.000Z",
      activatedAt: null,
    },
    entitlements: [{
      kind: "feature",
      value: "included",
      record: {
        schemaVersion: 1,
        entitlementId: "component.entitlement.acme.principal.inbox",
        subscriptionId: "component.subscription.acme.zuni",
        tenantId: "component.tenant.acme",
        workspaceId: "component.workspace.acme.principal",
        productId: "zuni",
        capability: "inbox",
        status: "pending",
        sourcePlanId: "start",
        createdAt: "2026-08-16T09:20:00.000Z",
      },
    }],
  };
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

test("builds canonical deterministic execution plan with compensating rollback", () => {
  const activationPlan = activationFixture();
  const plan = buildZuniActivationExecutionPlan({
    activationPlan,
    requestedAt: "2026-08-16T09:21:00.000Z",
  });

  assert.equal(plan.productionWriteAuthorized, false);
  assert.equal(plan.automaticCharge, false);
  assert.deepEqual(plan.steps, [
    "register-tenant-workspace",
    "start-subscription",
    "grant-entitlements",
    "enqueue-provisioning",
  ]);
  assert.equal(
    plan.provisioningJob.provisioningJobId,
    "component.provisioning.acme.principal.zuni",
  );
  assert.equal(
    plan.provisioningJob.idempotencyKey,
    `zuni-activation:${activationPlan.correlationId}`,
  );
  assert.equal(plan.rollback.automaticDelete, false);
  assert.equal(plan.rollback.strategy, "compensating-actions-only");
});

test("dry-run audits without runtime writes", async () => {
  const runtime = fakeRuntime();
  const audits = [];
  const result = await executeZuniActivationPlan({
    runtime,
    activationPlan: activationFixture(),
    audit: async (event) => audits.push(event),
    mode: "dry-run",
    requestedAt: "2026-08-16T09:22:00.000Z",
  });

  assert.equal(result.executed, false);
  assert.equal(result.writeAuthorized, false);
  assert.deepEqual(runtime.state.calls, []);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].stage, "dry-run");
  assert.equal(audits[0].outcome, "planned");
});

test("write mode requires explicit governed authorization", async () => {
  await assert.rejects(
    () => executeZuniActivationPlan({
      runtime: fakeRuntime(),
      activationPlan: activationFixture(),
      audit: async () => {},
      mode: "write",
    }),
    /write authorization is required/,
  );
});

test("authorized write is idempotent for identical records", async () => {
  const runtime = fakeRuntime();
  const activationPlan = activationFixture();
  const audits = [];
  const args = {
    runtime,
    activationPlan,
    audit: async (event) => audits.push(event),
    mode: "write",
    authorization: ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION,
    requestedAt: "2026-08-16T09:23:00.000Z",
  };

  const first = await executeZuniActivationPlan(args);
  const firstCalls = [...runtime.state.calls];
  const second = await executeZuniActivationPlan(args);

  assert.equal(first.executed, true);
  assert.deepEqual(firstCalls, [
    "registerTenantWorkspace",
    "startSubscription",
    "grantEntitlement",
    "enqueueProvisioning",
  ]);
  assert.equal(second.result.tenantCreated, false);
  assert.equal(second.result.workspaceCreated, false);
  assert.equal(second.result.subscriptionCreated, false);
  assert.equal(second.result.entitlementsCreated, 0);
  assert.equal(second.result.provisioningEnqueued, false);
  assert.deepEqual(runtime.state.calls, firstCalls);
  assert.equal(audits.filter((event) => event.outcome === "persisted").length, 2);
});

test("fails closed on conflicting existing tenant", async () => {
  const runtime = fakeRuntime();
  const activationPlan = activationFixture();
  runtime.state.tenant = { ...activationPlan.tenant, displayName: "Other" };

  await assert.rejects(
    () => executeZuniActivationPlan({
      runtime,
      activationPlan,
      audit: async () => {},
      mode: "write",
      authorization: ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION,
    }),
    /tenant already exists with a conflicting record/,
  );
  assert.deepEqual(runtime.state.calls, []);
});
