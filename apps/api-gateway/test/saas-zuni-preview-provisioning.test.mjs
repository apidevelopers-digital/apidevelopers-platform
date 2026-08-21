import test from "node:test";
import assert from "node:assert/strict";

import {
  createZuniPreviewProvisioningApp,
  ZUNI_PREVIEW_PROVISION_SCOPE,
} from "../src/saas-zuni-preview-provisioning.mjs";

const SUBJECT_REF = "a".repeat(64);
const NOW = "2026-08-21T13:05:00.000Z";

function actor(scopes = []) {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "component.principal.backend-delegated",
      tenantId: "component.tenant.institution",
      status: "active",
      scopes: Object.freeze([...scopes]),
    }),
  });
}

function harness({ auth = actor([ZUNI_PREVIEW_PROVISION_SCOPE]) } = {}) {
  const state = {
    tenant: null,
    workspace: null,
    subscription: null,
    entitlement: null,
    job: null,
    grant: null,
    onboarding: null,
  };

  const saasRuntime = {
    async registerTenantWorkspace({ tenant, workspace }) {
      state.tenant = tenant;
      state.workspace = workspace;
      return { tenant, workspace };
    },
    async getSubscription() { return state.subscription; },
    async startSubscription(input) {
      state.subscription = Object.freeze({ ...input });
      return state.subscription;
    },
    async activateSubscription({ activatedAt }) {
      state.subscription = Object.freeze({ ...state.subscription, status: "active", activatedAt });
      return state.subscription;
    },
    async getEntitlement() { return state.entitlement; },
    async grantEntitlement(input) {
      state.entitlement = Object.freeze({ ...input });
      return state.entitlement;
    },
    async getProvisioningJob() { return state.job; },
    async enqueueProvisioning(input) {
      state.job = Object.freeze({ ...input, status: "queued" });
      return { created: true, job: state.job };
    },
    async claimProvisioning({ at }) {
      state.job = Object.freeze({ ...state.job, status: "running", startedAt: at });
      return state.job;
    },
    async completeProvisioning({ at, result }) {
      state.job = Object.freeze({ ...state.job, status: "succeeded", completedAt: at, result });
      return state.job;
    },
  };

  const saasAccess = {
    async resolveActiveGrant() {
      return state.grant
        ? { resolved: true, reason: null, grant: state.grant }
        : { resolved: false, reason: "not_found", grant: null };
    },
    async grantAccess(input) {
      state.grant = Object.freeze({ ...input });
      return state.grant;
    },
    async activateAccess({ provisioningJobId, at }) {
      state.grant = Object.freeze({ ...state.grant, status: "active", provisioningJobId, activatedAt: at });
      return state.grant;
    },
    async setOnboarding(input) {
      state.onboarding = Object.freeze({ ...input });
      return state.onboarding;
    },
  };

  const federatedPrincipal = {
    async resolveFederatedPrincipal({ tenantId }) {
      return Object.freeze({
        principalId: "component.principal.0123456789abcdef0123456789abcdef",
        tenantId,
        status: "active",
      });
    },
  };

  const app = createZuniPreviewProvisioningApp({
    authenticator: { authenticate: async () => auth },
    saasRuntime,
    saasAccess,
    federatedPrincipal,
    clock: () => NOW,
  });

  return { app, state };
}

async function request(app, { headers = {}, body = {} } = {}) {
  return app.handleRequest({
    method: "POST",
    url: "/v1/saas/zuni-preview/provision",
    headers,
    body,
  });
}

test("preview bootstrap rejects delegated callers without narrow provisioning scope", async () => {
  const { app, state } = harness({ auth: actor(["saas:access:delegate"]) });
  const result = await request(app, {
    headers: { "x-delegated-subject-ref": SUBJECT_REF },
    body: { idempotencyKey: "zuni-preview-bootstrap-001" },
  });

  assert.equal(result.status, 403);
  assert.equal(state.tenant, null);
});

test("preview bootstrap requires server-derived 64-hex subject ref", async () => {
  const { app, state } = harness();
  const result = await request(app, {
    headers: { "x-delegated-subject-ref": "not-a-subject" },
    body: { idempotencyKey: "zuni-preview-bootstrap-001" },
  });

  assert.equal(result.status, 400);
  assert.equal(state.tenant, null);
});

test("preview bootstrap fixes tenant, workspace and commercial plan", async () => {
  const { app, state } = harness();
  const result = await request(app, {
    headers: { "x-delegated-subject-ref": SUBJECT_REF },
    body: {
      idempotencyKey: "zuni-preview-bootstrap-001",
      tenantSlug: "attacker",
      workspaceSlug: "attacker",
      subjectRef: "b".repeat(64),
    },
  });

  assert.equal(result.status, 201);
  const payload = JSON.parse(result.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.provisioned, true);
  assert.equal(payload.productId, "zuni");
  assert.equal(payload.planId, "pro");
  assert.equal(payload.status, "active");
  assert.equal(state.tenant.slug, "zuni-preview");
  assert.equal(state.workspace.slug, "preview-main");
  assert.equal(state.subscription.planId, "pro");
  assert.equal(state.subscription.monthlyAmount, 59700);
  assert.equal(JSON.stringify(payload).includes(SUBJECT_REF), false);
  assert.equal(JSON.stringify(payload).includes("attacker"), false);
});
