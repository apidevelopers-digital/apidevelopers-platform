import test from "node:test";
import assert from "node:assert/strict";

import {
  createZuniCommercialActivationControlledWriteApp,
  ZUNI_COMMERCIAL_ACTIVATION_WRITE_SCOPE,
  ZUNI_COMMERCIAL_ACTIVATION_WRITE_APPROVAL,
} from "../src/saas-zuni-commercial-activation-controlled-write.mjs";

function actor(scopes = []) {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "component.principal.zuni-controlled-write-test",
      tenantId: "component.tenant.institution",
      status: "active",
      scopes: Object.freeze([...scopes]),
    }),
  });
}

function plan() {
  return {
    id: "pro",
    product_id: "zuni",
    commercial_state: "early_access",
    pricing_status: "published",
    sellable: true,
    pricing: { monthly_cents: 59700 },
    limits: { whatsapp_channels: 2, users: 10 },
    capabilities: { inbox: "included", templates: "included" },
  };
}

function memoryRuntime() {
  const state = {
    tenant: null,
    workspace: null,
    subscription: null,
    entitlements: new Map(),
    job: null,
  };
  return {
    state,
    async getTenant() { return state.tenant; },
    async getWorkspace() { return state.workspace; },
    async getSubscription() { return state.subscription; },
    async getEntitlement(id) { return state.entitlements.get(id) ?? null; },
    async getProvisioningJob() { return state.job; },
    async registerTenantWorkspace({ tenant, workspace }) {
      state.tenant = tenant;
      state.workspace = workspace;
      return { tenant, workspace };
    },
    async startSubscription(record) {
      state.subscription = record;
      return record;
    },
    async grantEntitlement(record) {
      state.entitlements.set(record.entitlementId, record);
      return record;
    },
    async enqueueProvisioning(record) {
      state.job = record;
      return { executed: true, job: record };
    },
  };
}

function requestBody(overrides = {}) {
  return {
    approval: ZUNI_COMMERCIAL_ACTIVATION_WRITE_APPROVAL,
    plan: plan(),
    tenantSlug: "cliente-demo",
    tenantDisplayName: "Cliente Demo",
    organizationId: "component.organization.cliente-demo",
    workspaceSlug: "principal",
    workspaceDisplayName: "Principal",
    createdAt: "2026-09-08T18:00:00.000Z",
    requestedAt: "2026-09-08T18:05:00.000Z",
    ...overrides,
  };
}

function harness({ writeEnabled = false, scopes = [ZUNI_COMMERCIAL_ACTIVATION_WRITE_SCOPE] } = {}) {
  const runtime = memoryRuntime();
  const auditEvents = [];
  const app = createZuniCommercialActivationControlledWriteApp({
    authenticator: { authenticate: async () => actor(scopes) },
    runtime,
    audit: async (event) => { auditEvents.push(event); },
    writeEnabled,
  });
  return { app, runtime, auditEvents };
}

test("controlled Zuni activation write is locked by default", async () => {
  const { app, runtime } = harness();
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/zuni/activation/write",
    body: requestBody(),
  });
  assert.equal(result.status, 423);
  const payload = JSON.parse(result.body);
  assert.equal(payload.reason, "zuni_commercial_activation_write_disabled");
  assert.equal(payload.writesExecuted, false);
  assert.equal(runtime.state.tenant, null);
});

test("controlled Zuni activation write requires exact approval", async () => {
  const { app, runtime } = harness({ writeEnabled: true });
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/zuni/activation/write",
    body: requestBody({ approval: "WRONG" }),
  });
  assert.equal(result.status, 403);
  assert.equal(runtime.state.tenant, null);
});

test("controlled Zuni activation write executes only in isolated enabled harness", async () => {
  const { app, runtime, auditEvents } = harness({ writeEnabled: true });
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/zuni/activation/write",
    body: requestBody(),
  });
  assert.equal(result.status, 201, result.body);
  const payload = JSON.parse(result.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.executed, true);
  assert.equal(payload.writeAuthorized, true);
  assert.equal(payload.automaticCharge, false);
  assert.equal(payload.chargeExecuted, false);
  assert.equal(runtime.state.tenant.slug, "cliente-demo");
  assert.equal(runtime.state.workspace.slug, "principal");
  assert.equal(runtime.state.subscription.planId, "pro");
  assert.equal(runtime.state.entitlements.size > 0, true);
  assert.equal(runtime.state.job.status, "queued");
  assert.equal(auditEvents.length, 2);
  assert.deepEqual(auditEvents.map((event) => event.outcome), ["started", "persisted"]);
});
