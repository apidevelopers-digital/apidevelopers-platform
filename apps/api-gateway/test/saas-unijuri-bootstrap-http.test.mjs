import test from "node:test";
import assert from "node:assert/strict";

import {
  createUniJuriBootstrapHttpApp,
  resolveUniJuriBootstrapWriteEnabled,
  UNIJURI_BOOTSTRAP_APPROVAL,
} from "../src/saas-unijuri-bootstrap-http.mjs";

const subjectRef = "a".repeat(64);
const scope = "saas:uni-juri:bootstrap:write";

function actor(scopes = [scope]) {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "component.principal.unijuri-bootstrap-http-test",
      tenantId: "component.tenant.institution",
      status: "active",
      scopes: Object.freeze([...scopes]),
    }),
  });
}

function harness({ writeEnabled = false, scopes = [scope] } = {}) {
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
    authenticator: { authenticate: async () => actor(scopes) },
    saasRuntime: runtime,
    federatedPrincipal,
    audit: async () => {},
    writeEnabled,
    clock: () => "2026-09-12T18:00:00.000Z",
  });
  return { app, calls, records };
}

function payload(overrides = {}) {
  return {
    approval: UNIJURI_BOOTSTRAP_APPROVAL,
    input: {
      tenantSlug: "uni",
      workspaceSlug: "uni-juri-main",
      displayName: "UNI",
      planId: "internal",
      subjectRef,
      idempotencyKey: "unijuri-bootstrap-http-20260912",
      ...overrides,
    },
  };
}

test("UniJuri bootstrap HTTP route is fail-closed by default", async () => {
  const { app, calls } = harness();
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/uni-juri/bootstrap",
    body: payload(),
  });
  assert.equal(result.status, 423);
  const body = JSON.parse(result.body);
  assert.equal(body.reason, "write_disabled");
  assert.equal(body.writesExecuted, false);
  assert.deepEqual(calls, []);
});

test("UniJuri bootstrap HTTP route requires exact approval", async () => {
  const { app, calls } = harness({ writeEnabled: true });
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/uni-juri/bootstrap",
    body: { ...payload(), approval: "WRONG" },
  });
  assert.equal(result.status, 423);
  assert.equal(JSON.parse(result.body).reason, "approval_required");
  assert.deepEqual(calls, []);
});

test("UniJuri bootstrap HTTP route executes only in isolated enabled harness", async () => {
  const { app, calls, records } = harness({ writeEnabled: true });
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

test("UniJuri bootstrap HTTP route rejects non-POST without writes", async () => {
  const { app, calls } = harness({ writeEnabled: true });
  const result = await app.handleRequest({
    method: "GET",
    url: "/v1/saas/uni-juri/bootstrap",
  });
  assert.equal(result.status, 405);
  assert.equal(JSON.parse(result.body).writesExecuted, false);
  assert.deepEqual(calls, []);
});

test("UniJuri bootstrap write env flag is exact and fail-closed", () => {
  assert.equal(resolveUniJuriBootstrapWriteEnabled({}), false);
  assert.equal(resolveUniJuriBootstrapWriteEnabled({
    UNIJURI_BOOTSTRAP_WRITE_ENABLED: "false",
  }), false);
  assert.equal(resolveUniJuriBootstrapWriteEnabled({
    UNIJURI_BOOTSTRAP_WRITE_ENABLED: "TRUE",
  }), true);
  assert.equal(resolveUniJuriBootstrapWriteEnabled({
    UNIJURI_BOOTSTRAP_WRITE_ENABLED: "1",
  }), false);
});
