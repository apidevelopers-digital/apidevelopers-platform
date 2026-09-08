import test from "node:test";
import assert from "node:assert/strict";

import {
  createZuniCommercialActivationDryRunApp,
  ZUNI_COMMERCIAL_ACTIVATION_DRY_RUN_SCOPE,
} from "../src/saas-zuni-commercial-activation-dry-run.mjs";

function actor(scopes = []) {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "component.principal.zuni-commercial-dry-run-test",
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

function harness(auth = actor([ZUNI_COMMERCIAL_ACTIVATION_DRY_RUN_SCOPE])) {
  let current = auth;
  const authenticator = {
    authenticate: async () => current,
  };
  const app = createZuniCommercialActivationDryRunApp({ authenticator });
  return {
    app,
    setAuth(value) { current = value; },
  };
}

test("commercial activation dry-run is fail-closed without scope", async () => {
  const { app } = harness(actor([]));
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/zuni/activation/dry-run",
    body: {},
  });
  assert.equal(result.status, 403);
});

test("commercial activation dry-run rejects non-sellable plan without writes", async () => {
  const { app } = harness();
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/zuni/activation/dry-run",
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

test("commercial activation dry-run executes no writes and returns audevit eridence", async () => {
  const { app } = harness();
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/zuni/activation/dry-run",
    body: {
      plan: plan(),
      tenantSlug: "cliente-demo",
      tenantDisplayName: "Cliente Demo",
      organizationId: "component.organization.cliente-demo",
      workspaceSlug: "principal",
      workspaceDisplayName: "Principal",
      createdAt: "2026-09-08T18:00:00.000Z",
      requestedAt: "2026-09-08T18:05:00.000Z",
    },
  });

  assert.equal(result.status, 200);
  const payload = JSON.parse(result.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.productId, "zuni");
  assert.equal(payload.planId, "pro");
  assert.equal(payload.executed, false);
  assert.equal(payload.writeAuthorized, false);
  assert.equal(payload.writesExecuted, false);
  assert.equal(payload.chargeExecuted, false);
  assert.deepEqual(payload.execution.steps, [
    "register-tenant-workspace",
    "start-subscription",
    "grant-entitlements",
    "enqueue-provisioning",
  ]);
  assert.equal(payload.audit.length, 1);
  assert.equal(payload.audit[0].stage, "dry-run");
  assert.equal(payload.audit[0].outcome, "planned");
  assert.equal(payload.secretsExposed, false);
});
