import test from "node:test";
import assert from "node:assert/strict";

import {
  createZuniCommercialActivationWriteApp,
  ZUNI_COMMERCIAL_ACTIVATION_WRITE_SCOPE,
} from "../src/saas-zuni-commercial-activation-write.mjs";
import { ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION } from "@apidevelopers/saas-runtime";

function actor(scopes = []) {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "component.principal.zuni-write-test",
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
    capabilities: { inbox: "included" },
  };
}

function fakeRuntime() {
  const calls = [];
  const runtime = {
    getTenant: async () => null,
    getWorkspace: async () => null,
    registerTenantWorkspace: async (value) => { calls.push(["registerTenantWorkspace", value]); return value; },
    getSubscription: async () => null,
    startSubscription: async (value) => { calls.push(["startSubscription", value]); return value; },
    getEntitlement: async () => null,
    grantEntitlement: async (value) => { calls.push(["grantEntitlement", value]); return value; },
    getProvisioningJob: async () => null,
    enqueueProvisioning: async (value) => {
      calls.push(["enqueueProvisioning", value]);
      return { executed: true, job: value };
    },
  };
  return { runtime, calls };
}

function request(app, body) {
  return app.handleRequest({
    method: "POST",
    url: "/v1/saas/zuni/activation/write",
    body,
  });
}

test("write activation is fail-closed without scope", async () => {
  const { runtime, calls } = fakeRuntime();
  const app = createZuniCommercialActivationWriteApp({
    authenticator: { authenticate: async () => actor([]) },
    saasRuntime: runtime,
  });
  const result = await request(app, {});
  assert.equal(result.status, 403);
  assert.equal(calls.length, 0);
});

test("write activation executes no writes without exact authorization", async () => {
  const { runtime, calls } = fakeRuntime();
  const app = createZuniCommercialActivationWriteApp({
    authenticator: { authenticate: async () => actor([ZUNI_COMMERCIAL_ACTIVATION_WRITE_SCOPE]) },
    saasRuntime: runtime,
  });
  const result = await request(app, {
    plan: plan(),
    tenantSlug: "cliente-demo",
    tenantDisplayName: "Cliente Demo",
    organizationId: "component.organization.cliente-demo",
    writeAuthorization: "NO",
  });
  assert.equal(result.status, 403);
  assert.equal(calls.length, 0);
  const payload = JSON.parse(result.body);
  assert.equal(payload.writesExecuted, false);
  assert.equal(payload.chargeExecuted, false);
});

test("write activation uses existing governed runtime only after exact authorization", async () => {
  const { runtime, calls } = fakeRuntime();
  const audit = [];
  const app = createZuniCommercialActivationWriteApp({
    authenticator: { authenticate: async () => actor([ZUNI_COMMERCIAL_ACTIVATION_WRITE_SCOPE]) },
    saasRuntime: runtime,
    audit: async (event) => audit.push(event),
  });
  const result = await request(app, {
    plan: plan(),
    tenantSlug: "cliente-demo",
    tenantDisplayName: "Cliente Demo",
    organizationId: "component.organization.cliente-demo",
    workspaceSlug: "principal",
    workspaceDisplayName: "Principal",
    createdAt: "2026-09-08T19:00:00.000Z",
    requestedAt: "2026-09-08T19:01:00.000Z",
    writeAuthorization: ZUNI_SAAS_ACTIVATION_WRITE_AUTHORIZATION,
  });
  assert.equal(result.status, 201);
  const payload = JSON.parse(result.body);
  assert.equal(payload.executed, true);
  assert.equal(payload.writeAuthorized, true);
  assert.equal(payload.automaticCharge, false);
  assert.equal(payload.chargeExecuted, false);
  assert.equal(calls.filter(([name]) => name === "registerTenantWorkspace").length, 1);
  assert.equal(calls.filter(([name]) => name === "startSubscription").length, 1);
  assert.ok(calls.filter(([name]) => name === "grantEntitlement").length >= 1);
  assert.equal(calls.filter(([name]) => name === "enqueueProvisioning").length, 1);
  assert.equal(audit.at(-1).outcome, "persisted");
});
