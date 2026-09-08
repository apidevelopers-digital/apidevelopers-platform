import test from "node:test";
import assert from "node:assert/strict";

import {
  createZuniCommercialActivationPlanApp,
  ZUNI_COMMERCIAL_ACTIVATION_PLAN_SCOPE,
} from "../src/saas-zuni-commercial-activation-plan.mjs";

function actor(scopes = []) {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "component.principal.zuni-commercial-test",
      tenantId: "component.tenant.institution",
      status: "active",
      scopes: Object.freeze([...scopes]),
    }),
  });
}

function plan(overrides = {}) {
  return {
    id: "pro",
    product_id: "zuni",
    commercial_state: "early_access",
    pricing_status: "published",
    sellable: true,
    pricing: { monthly_cents: 59700 },
    limits: { whatsapp_channels: 2, users: 10 },
    capabilities: { inbox: "included", templates: "included" },
    ...overrides,
  };
}

function request(app, body, auth = actor([ZUNI_COMMERCIAL_ACTIVATION_PLAN_SCOPE])) {
  app.__auth = auth;
  return app.handleRequest({
    method: "POST",
    url: "/v1/saas/zuni/activation/plan",
    headers: {},
    body,
  });
}

function harness(auth = actor([ZUNI_COMMERCIAL_ACTIVATION_PLAN_SCOPE])) {
  let current = auth;
  const authenticator = {
    authenticate: async () => current,
  };
  const app = createZuniCommercialActivationPlanApp({ authenticator });
  return {
    app,
    setAuth(value) { current = value; },
  };
}

test("commercial activation plan is fail-closed without scope", async () => {
  const { app } = harness(actor([]));
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/zuni/activation/plan",
    body: {},
  });
  assert.equal(result.status, 403);
});

test("commercial activation plan rejects non-sellable preview plan", async () => {
  const { app } = harness();
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/zuni/activation/plan",
    body: {
      plan: plan({
        id: "master",
        commercial_state: "preview",
        pricing_status: "proposal",
        sellable: false,
      }),
      tenantSlug: "cliente-demo",
      tenantDisplayName: "Cliente Demo",
      organizationId: "component.organization.cliente-demo",
    },
  });
  assert.equal(result.status, 400);
  const payload = JSON.parse(result.body);
  assert.equal(payload.ok, false);
  assert.equal(payload.writesExecuted, false);
  assert.equal(payload.chargeExecuted, false);
});

test("commercial activation plan returns governed dry execution without writes", async () => {
  const { app } = harness();
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/zuni/activation/plan",
    body: {
      plan: plan(),
      tenantSlug: "cliente-demo",
      tenantDisplayName: "Cliente Demo",
      organizationId: "component.organization.cliente-demo",
      workspaceSlug: "principal",
      workspaceDisplayName: "Principal",
      createdAt: "2026-09-08T18:00:00.000Z",
    },
  });

  assert.equal(result.status, 200);
  const payload = JSON.parse(result.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.productId, "zuni");
  assert.equal(payload.planId, "pro");
  assert.equal(payload.activationMode, "assisted");
  assert.equal(payload.automaticCharge, false);
  assert.equal(payload.productionWriteAuthorized, false);
  assert.equal(payload.writesExecuted, false);
  assert.equal(payload.chargeExecuted, false);
  assert.deepEqual(payload.execution.steps, [
    "register-tenant-workspace",
    "start-subscription",
    "grant-entitlements",
    "enqueue-provisioning",
  ]);
  assert.equal(payload.subscription.status, "assisted_activation");
  assert.equal(payload.execution.provisioningStatus, "queued");
  assert.equal(payload.secretsExposed, false);
});
