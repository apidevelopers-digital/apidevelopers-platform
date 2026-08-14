import test from "node:test";
import assert from "node:assert/strict";

import { createSaasProvisioningApp } from "../src/saas-provisioning.mjs";

const SUBJECT_REF = "a".repeat(64);
const NOW = "2026-08-14T21:20:00.000Z";

function actor(scopes = []) {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "component.principal.checkout",
      tenantId: "component.tenant.institution",
      scopes: Object.freeze([...scopes]),
    }),
  });
}

function buildHarness({ auth = actor(["saas:provision"]) } = {}) {
  const state = {
    subscription: null,
    entitlement: null,
    job: null,
    grant: null,
    onboarding: null,
    registrations: 0,
    grantsCreated: 0,
    jobsCreated: 0,
  };

  const saasRuntime = {
    registerTenantWorkspace: async () => { state.registrations += 1; },
    getSubscription: async () => state.subscription,
    startSubscription: async (input) => {
      state.subscription = Object.freeze({ ...input });
      return state.subscription;
    },
    activateSubscription: async ({ activatedAt }) => {
      state.subscription = Object.freeze({ ...state.subscription, status: "active", activatedAt });
      return state.subscription;
    },
    getEntitlement: async () => state.entitlement,
    grantEntitlement: async (input) => {
      state.entitlement = Object.freeze({ ...input });
      return state.entitlement;
    },
    getProvisioningJob: async () => state.job,
    enqueueProvisioning: async (input) => {
      state.jobsCreated += 1;
      state.job = Object.freeze({ ...input, status: "queued" });
      return Object.freeze({ created: true, job: state.job });
    },
    claimProvisioning: async ({ at }) => {
      state.job = Object.freeze({ ...state.job, status: "running", startedAt: at });
      return state.job;
    },
    completeProvisioning: async ({ at, result }) => {
      state.job = Object.freeze({ ...state.job, status: "succeeded", completedAt: at, result });
      return state.job;
    },
  };

  const saasAccess = {
    resolveActiveGrant: async () => state.grant
      ? Object.freeze({ resolved: true, reason: null, grant: state.grant })
      : Object.freeze({ resolved: false, reason: "not_found", grant: null }),
    grantAccess: async (input) => {
      state.grantsCreated += 1;
      state.grant = Object.freeze({ ...input });
      return state.grant;
    },
    activateAccess: async ({ provisioningJobId, at }) => {
      state.grant = Object.freeze({ ...state.grant, status: "active", provisioningJobId, activatedAt: at });
      return state.grant;
    },
    setOnboarding: async (input) => {
      state.onboarding = Object.freeze({ ...input });
      return state.onboarding;
    },
  };

  const federatedPrincipal = {
    resolveFederatedPrincipal: async ({ tenantId }) => Object.freeze({
      principalId: "component.principal.0123456789abcdef0123456789abcdef",
      tenantId,
      status: "active",
    }),
  };

  const app = createSaasProvisioningApp({
    authenticator: { authenticate: async () => auth },
    saasRuntime,
    saasAccess,
    federatedPrincipal,
    clock: () => NOW,
  });

  return { app, state };
}

function payload(overrides = {}) {
  return {
    tenantSlug: "acme",
    workspaceSlug: "zuni-main",
    displayName: "Acme",
    planId: "zuni-pro",
    currency: "BRL",
    monthlyAmount: 597,
    subjectRef: SUBJECT_REF,
    idempotencyKey: "mp-payment-123456",
    ...overrides,
  };
}

async function provision(app, body = payload()) {
  return app.handleRequest({
    method: "POST",
    url: "/v1/saas/provision",
    headers: {},
    body,
  });
}

test("provision route fails closed without authentication", async () => {
  const { app, state } = buildHarness({ auth: null });
  const response = await provision(app);
  assert.equal(response.status, 401);
  assert.equal(JSON.parse(response.body).reason, "unauthorized");
  assert.equal(state.registrations, 0);
});

test("provision route requires saas:provision scope", async () => {
  const { app, state } = buildHarness({ auth: actor(["saas:access:read"]) });
  const response = await provision(app);
  assert.equal(response.status, 403);
  assert.equal(JSON.parse(response.body).reason, "provision_scope_forbidden");
  assert.equal(state.registrations, 0);
});

test("approved commercial event provisions Zuni idempotently and returns no subject PII", async () => {
  const { app, state } = buildHarness();

  const first = await provision(app, payload({ email: "must-not-appear@example.com" }));
  assert.equal(first.status, 201);
  const body1 = JSON.parse(first.body);
  assert.equal(body1.ok, true);
  assert.equal(body1.provisioned, true);
  assert.equal(body1.productId, "zuni");
  assert.equal(body1.planId, "zuni-pro");
  assert.equal(body1.status, "active");
  assert.equal(body1.tenantId, "component.tenant.acme");
  assert.equal(body1.workspaceId, "component.workspace.acme.zuni-main");
  assert.equal(state.jobsCreated, 1);
  assert.equal(state.grantsCreated, 1);
  assert.equal(state.onboarding.status, "completed");

  const serialized = JSON.stringify(body1);
  assert.equal(serialized.includes(SUBJECT_REF), false);
  assert.equal(serialized.includes("must-not-appear@example.com"), false);

  const second = await provision(app);
  assert.equal(second.status, 201);
  const body2 = JSON.parse(second.body);
  assert.equal(body2.accessGrantId, body1.accessGrantId);
  assert.equal(body2.provisioningJobId, body1.provisioningJobId);
  assert.equal(state.jobsCreated, 1);
  assert.equal(state.grantsCreated, 1);
});

test("retry with conflicting commercial binding is rejected", async () => {
  const { app, state } = buildHarness();
  const first = await provision(app);
  assert.equal(first.status, 201);

  const conflict = await provision(app, payload({ monthlyAmount: 1290 }));
  assert.equal(conflict.status, 409);
  assert.equal(JSON.parse(conflict.body).reason, "provisioning_failed");
  assert.equal(state.jobsCreated, 1);
  assert.equal(state.grantsCreated, 1);
});

test("unsupported currency is rejected before provisioning", async () => {
  const { app, state } = buildHarness();
  const response = await provision(app, payload({ currency: "USD" }));
  assert.equal(response.status, 400);
  assert.equal(JSON.parse(response.body).reason, "invalid_provision_request");
  assert.equal(state.jobsCreated, 0);
});
