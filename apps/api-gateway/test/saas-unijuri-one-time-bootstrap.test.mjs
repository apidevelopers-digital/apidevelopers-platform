import test from "node:test";
import assert from "node:assert/strict";

import {
  createUniJuriBootstrapHttpApp,
  UNIJURI_BOOTSTRAP_APPROVAL,
  UNIJURI_ONE_TIME_PRODUCTION_APPROVAL,
} from "../src/saas-unijuri-bootstrap-http.mjs";

const subjectRef = "a".repeat(64);
const scope = "saas:uni-juri:bootstrap:write";

function actor() {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "component.principal.unijuri-one-time-bootstrap-test",
      tenantId: "component.tenant.institution",
      status: "active",
      scopes: Object.freeze([scope]),
    }),
  });
}

function harness() {
  const calls = [];
  const records = {};
  const runtime = {
    registerTenantWorkspace: async (value) => {
      calls.push("register");
      records.tenant = value.tenant;
      records.workspace = value.workspace;
      return value;
    },
    getSubscription: async () => records.subscription ?? null,
    startSubscription: async (value) => (records.subscription = value),
    activateSubscription: async ({ subscriptionId, activatedAt }) => (
      records.subscription = {
        ...records.subscription,
        subscriptionId,
        status: "active",
        activatedAt,
      }
    ),
    getEntitlement: async () => records.entitlement ?? null,
    grantEntitlement: async (value) => (records.entitlement = value),
    getProvisioningJob: async () => records.job ?? null,
    enqueueProvisioning: async ({ requestedAt, ...value }) => ({
      job: (records.job = { ...value, requestedAt, status: "queued" }),
    }),
    claimProvisioning: async ({ at }) => (
      records.job = { ...records.job, status: "running", claimedAt: at }
    ),
    completeProvisioning: async ({ at, result }) => (
      records.job = { ...records.job, status: "succeeded", completedAt: at, result }
    ),
  };
  const federatedPrincipal = {
    resolveFederatedPrincipal: async ({ tenantId, provider, externalSubject }) => {
      calls.push("principal");
      assert.equal(provider, "unico");
      assert.equal(externalSubject, subjectRef);
      return { principalId: `principal.${tenantId}` };
    },
  };
  const app = createUniJuriBootstrapHttpApp({
    authenticator: { authenticate: async () => actor() },
    saasRuntime: runtime,
    federatedPrincipal,
    audit: async () => {},
    writeEnabled: false,
    clock: () => "2026-09-13T06:45:00.000Z",
  });
  return { app, calls, records };
}

function payload(overrides = {}) {
  return {
    approval: UNIJURI_BOOTSTRAP_APPROVAL,
    productionApproval: UNIJURI_ONE_TIME_PRODUCTION_APPROVAL,
    input: {
      tenantSlug: "uni",
      workspaceSlug: "uni-juri-main",
      displayName: "UNI",
      planId: "internal",
      subjectRef,
      idempotencyKey: "unijuri-bootstrap-prod-20260913-v1",
      ...overrides,
    },
  };
}

test("one-time production bridge remains locked without exact production approval", async () => {
  const { app, calls } = harness();
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/uni-juri/bootstrap",
    body: { ...payload(), productionApproval: "WRONG" },
  });
  assert.equal(result.status, 423);
  assert.equal(JSON.parse(result.body).reason, "write_disabled");
  assert.deepEqual(calls, []);
});

test("one-time production bridge remains locked when exact tuple changes", async () => {
  const { app, calls } = harness();
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/uni-juri/bootstrap",
    body: payload({ idempotencyKey: "wrong" }),
  });
  assert.equal(result.status, 423);
  assert.equal(JSON.parse(result.body).reason, "write_disabled");
  assert.deepEqual(calls, []);
});

test("one-time production bridge executes exact governed tuple while env write remains disabled", async () => {
  const { app, calls, records } = harness();
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/uni-juri/bootstrap",
    body: payload(),
  });
  assert.equal(result.status, 201, result.body);
  const body = JSON.parse(result.body);
  assert.equal(body.ok, true);
  assert.equal(body.productId, "uni-juri");
  assert.equal(body.accessGrantCreated, false);
  assert.equal(body.chargeExecuted, false);
  assert.equal(body.secretsExposed, false);
  assert.equal(records.subscription.monthlyAmount, 0);
  assert.equal(records.entitlement.capability, "use_product");
  assert.equal(records.job.status, "succeeded");
  assert.deepEqual(calls, ["register", "principal"]);
});
