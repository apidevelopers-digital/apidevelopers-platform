import test from "node:test";
import assert from "node:assert/strict";

import {
  createUniJuriBootstrapWriter,
  UNIJURI_BOOTSTRAP_APPROVAL,
} from "../src/saas-unijuri-bootstrap-writer.mjs";

const subjectRef = "a".repeat(64);
const actor = (scopes) => ({ role: "service", principal: { id: "ops", tenantId: "tenant_uni", scopes } });

function deps({ scopes = ["saas:uni-juri:bootstrap:write"], writeEnabled = false } = {}) {
  const calls = [];
  const records = {};
  const runtime = {
    registerTenantWorkspace: async (v) => { calls.push("register"); records.tenant = v.tenant; records.workspace = v.workspace; },
    getSubscription: async () => records.subscription ?? null,
    startSubscription: async (v) => (records.subscription = v),
    activateSubscription: async ({ subscriptionId, activatedAt }) => (records.subscription = { ...records.subscription, subscriptionId, status: "active", activatedAt }),
    getEntitlement: async () => records.entitlement ?? null,
    grantEntitlement: async (v) => (records.entitlement = v),
    getProvisioningJob: async () => records.job ?? null,
    enqueueProvisioning: async ({ requestedAt, ...v }) => ({ job: (records.job = { ...v, requestedAt, status: "queued" }) }),
    claimProvisioning: async ({ at }) => (records.job = { ...records.job, status: "running", claimedAt: at }),
    completeProvisioning: async ({ at, result }) => (records.job = { ...records.job, status: "succeeded", completedAt: at, result }),
  };
  const principal = {
    resolveFederatedPrincipal: async ({ tenantId, provider, externalSubject }) => {
      calls.push("principal");
      assert.equal(provider, "unico");
      assert.equal(externalSubject, subjectRef);
      return { principalId: `principal.${tenantId}` };
    },
  };
  return {
    calls, records,
    writer: createUniJuriBootstrapWriter({
      authenticator: { authenticate: async () => actor(scopes) },
      saasRuntime: runtime,
      federatedPrincipal: principal,
      writeEnabled,
      clock: () => "2026-09-12T18:00:00.000Z",
    }),
  };
}

const input = {
  tenantSlug: "uni",
  workspaceSlug: "uni-juri-main",
  displayName: "UNI",
  planId: "internal",
  subjectRef,
  idempotencyKey: "unijuri-bootstrap-20260912",
};

test("bootstrap is fail-closed when write flag is disabled", async () => {
  const { writer, calls } = deps();
  const result = await writer.bootstrap({ approval: UNIJURI_BOOTSTRAP_APPROVAL, input });
  assert.equal(result.status, 423);
  assert.equal(result.reason, "write_disabled");
  assert.deepEqual(calls, []);
});

test("bootstrap requires exact approval token", async () => {
  const { writer, calls } = deps({ writeEnabled: true });
  const result = await writer.bootstrap({ approval: "no", input });
  assert.equal(result.status, 423);
  assert.equal(result.reason, "approval_required");
  assert.deepEqual(calls, []);
});

test("bootstrap requires dedicated scope", async () => {
  const { writer, calls } = deps({ scopes: ["saas:provision"], writeEnabled: true });
  const result = await writer.bootstrap({ approval: UNIJURI_BOOTSTRAP_APPROVAL, input });
  assert.equal(result.status, 403);
  assert.deepEqual(calls, []);
});

test("approved bootstrap creates context but no access grant or charge", async () => {
  const { writer, records, calls } = deps({ writeEnabled: true });
  const result = await writer.bootstrap({ approval: UNIJURI_BOOTSTRAP_APPROVAL, input });
  assert.equal(result.status, 201);
  assert.equal(result.productId, "uni-juri");
  assert.equal(records.workspace.productId, "uni-juri");
  assert.equal(records.subscription.status, "active");
  assert.equal(records.subscription.monthlyAmount, 0);
  assert.equal(records.entitlement.capability, "use_product");
  assert.equal(records.job.status, "succeeded");
  assert.equal(result.accessGrantCreated, false);
  assert.equal(result.chargeExecuted, false);
  assert.equal(result.secretsExposed, false);
  assert.deepEqual(calls, ["register", "principal"]);
});
