import assert from "node:assert/strict";
import test from "node:test";

import { createUniCoProvisioningApp } from "../src/saas-uni-co-provisioning.mjs";

const NOW = "2026-09-24T21:00:00.000Z";
const SUBJECT_A = "a".repeat(64);
const SUBJECT_B = "b".repeat(64);

function harness() {
  const state = { subscription: null, entitlement: null, job: null, grant: null };
  const app = createUniCoProvisioningApp({
    authenticator: { async authenticate() {
      return { role: "service", principal: { id: "diagnostic", status: "active", scopes: ["saas:provision"] } };
    }},
    saasRuntime: {
      async registerTenantWorkspace() {},
      async getSubscription() { return state.subscription; },
      async startSubscription(input) { state.subscription = { ...input }; return state.subscription; },
      async activateSubscription({ activatedAt }) { state.subscription = { ...state.subscription, status: "active", activatedAt }; return state.subscription; },
      async getEntitlement() { return state.entitlement; },
      async grantEntitlement(input) { state.entitlement = { ...input }; return state.entitlement; },
      async getProvisioningJob() { return state.job; },
      async enqueueProvisioning(input) { state.job = { ...input, status: "queued" }; return { created: true, job: state.job }; },
      async claimProvisioning({ at }) { state.job = { ...state.job, status: "running", startedAt: at }; return state.job; },
      async completeProvisioning({ at, result }) { state.job = { ...state.job, status: "succeeded", completedAt: at, result }; return state.job; },
    },
    federatedPrincipal: {
      async resolveFederatedPrincipal({ tenantId, externalSubject }) {
        return { principalId: `component.principal.${externalSubject.slice(0,32)}`, tenantId, status: "active" };
      },
    },
    saasAccess: {
      async resolveActiveGrant({ principalId }) {
        if (state.grant?.principalId === principalId) return { resolved: true, grant: state.grant };
        return { resolved: false, reason: "access_grant_not_found", grant: null };
      },
      async grantAccess(input) { state.grant = { ...input }; return state.grant; },
      async activateAccess({ provisioningJobId, at }) { state.grant = { ...state.grant, status: "active", provisioningJobId, activatedAt: at }; return state.grant; },
      async setOnboarding() {},
    },
    clock: () => NOW,
  });
  return { app, state };
}

function payload(subjectRef, idempotencyKey) {
  return {
    tenantSlug: "institution-preview",
    workspaceSlug: "uni-co-main",
    displayName: "Institution Preview",
    productId: "product:uni-co",
    subjectRef,
    idempotencyKey,
  };
}

test("diagnostic: completed workspace provisioning rejects a second principal with a different idempotency key", async () => {
  const { app, state } = harness();
  const first = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/uni-co/provision",
    body: JSON.stringify(payload(SUBJECT_A, `preview-bootstrap:product:uni-co:institution-preview:uni-co-main:${SUBJECT_A}`)),
  });
  assert.equal(first.status, 201);
  assert.equal(state.job.status, "succeeded");

  const second = await app.handleRequest({
    method: "POST",
    url: "/v1/saas/uni-co/provision",
    body: JSON.stringify(payload(SUBJECT_B, `preview-bootstrap:product:uni-co:institution-preview:uni-co-main:${SUBJECT_B}`)),
  });
  const body = JSON.parse(second.body);

  assert.equal(second.status, 400);
  assert.equal(body.reason, "invalid_uni_co_provision_request");
});
