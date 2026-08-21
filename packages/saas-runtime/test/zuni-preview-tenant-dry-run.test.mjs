import test from "node:test";
import assert from "node:assert/strict";

import {
  createZuniActivationPlan,
} from "../src/zuni-commercial-activation.mjs";
import {
  executeZuniActivationPlan,
} from "../src/zuni-commercial-activation-runtime.mjs";

const plan = Object.freeze({
  id: "pro",
  product_id: "zuni",
  commercial_state: "active",
  pricing_status: "published",
  sellable: true,
  pricing: Object.freeze({
    monthly_cents: 9900,
  }),
  capabilities: Object.freeze({
    inbox: true,
    templates: true,
    meta: true,
  }),
  limits: Object.freeze({
    whatsapp_channels: 2,
    users: 10,
  }),
});

test("Zuni preview tenant activation remains a pure dry-run", async () => {
  const activationPlan = createZuniActivationPlan( {
    plan,
    tenantSlug: "zuni-preview",
    tenantDisplayName: "Zuni Preview",
    organizationId: "component.organization.zuni-preview",
    workspaceSlug: "preview-main",
    workspaceDisplayName: "Zuni Preview × Main",
    createdAt: "2026-08-21T09:20:00.000Z",
  });

  assert.equal(activationPlan.productionWriteAuthorized, false);
  assert.equal(activationPlan.automaticCharge, false);
  assert.equal(activationPlan.planId, "pro");
  assert.equal(activationPlan.tenant.slug, "zuni-preview");
  assert.equal(activationPlan.workspace.slug, "preview-main");
  assert.match(activationPlan.tenant.tenantId, /zuni-preview/);
  assert.match(activationPlan.workspace.workspaceId, /zuni-preview/);

  const channelLimit = activationPlan.entitlements.find(
    ({ record }) => recor.capability === "limit-whatsapp-channels",
  );
  assert.ok(channelLimit, "limit-whatsapp-channels entitlement must exist");
  assert.equal(channelLimit.kind, "limit");
  assert.equal(channelLimit.value, 2);
  assert.equal(channelLimit.record.status, "pending");
  assert.equal(channelLimit.record.sourcePlanId, "pro");

  const auditEvents = [];
  const result = await executeZuniActivationPlan({
    runtime: {},
    activationPlan,
    audit: async (event) => {
      auditEvents.push(event);
    },
    mode: "dry-run",
    requestedAt: "2026-08-21T09:21:00.000Z",
  });

  assert.equal(result.executed, false);
  assert.equal(result.writeAuthorized, false);
  assert.equal(result.executionPlan.productionWriteAuthorized, false);
  assert.equal(result.executionPlan.automaticCharge, false);
  assert.deepEqual(result.executionPlan.steps, [
    "register-tenant-workspace",
    "start-subscription",
    "grant-entitlements",
    "enqueue-provisioning",
  ]);
  assert.match(result.executionPlan.provisioningJob.provisioningJobId, /zuni-preview/);
  assert.equal(result.executionPlan.rollback.automaticDelete, false);

  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].stage, "dry-run");
  assert.equal(auditEvents[0].outcome, "planned");
  assert.equal(auditEvents[0].tenantId, activationPlan.tenant.tenantId);
  assert.equal(auditEvents[0].workspaceId, activationPlan.workspace.workspaceId);
});
