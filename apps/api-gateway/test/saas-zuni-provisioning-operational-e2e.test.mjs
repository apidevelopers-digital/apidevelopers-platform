import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createOperationalGatewayWithReadonlyOperator } from "../src/operator-readonly-composition.mjs";

const NOW = "2026-08-18T20:00:00.000Z";
const SUBJECT_REF = "a".repeat(64);

function requestBody(overrides = {}) {
  return {
    tenantSlug: "e2e-zuni",
    workspaceSlug: "zuni-main",
    displayName: "E2E Zuni",
    planId: "zuni-pro",
    currency: "BRL",
    monthlyAmount: 597,
    subjectRef: SUBJECT_REF,
    idempotencyKey: "e2e-zuni-provision-001",
    ...overrides,
  };
}

async function createHarness(t, probeZuniProductReadiness) {
  const directory = await mkdtemp(join(tmpdir(), "zuni-provisioning-e2e-"));
  const stateFilePath = join(directory, "state.json");
  t.after(() => rm(directory, { recursive: true, force: true }));

  const gateway = createOperationalGatewayWithReadonlyOperator({
    stateFilePath,
    clock: () => NOW,
    probeZuniProductReadiness,
  });

  const issued = await gateway.apiKeyLifecycle.issueApiKey({
    tenantId: "component.tenant.institution",
    name: "Zuni provisioning E2E",
    scopes: ["saas:provision"],
  });

  const headers = {
    "x-tenant-id": "component.tenant.institution",
    "x-api-key": issued.secret,
  };

  return { gateway, headers };
}

async function provision(gateway, headers, body = requestBody()) {
  return gateway.app.handleRequest({
    method: "POST",
    url: "/v1/saas/provision",
    headers,
    body,
  });
}

test("operational composition provisions Zuni end-to-end with readiness evidence and idempotency", async (t) => {
  let probeCalls = 0;
  const { gateway, headers } = await createHarness(t, async () => {
    probeCalls += 1;
    return Object.freeze({
      ready: true,
      productId: "zuni",
      environment: "production",
      releaseSha: "0".repeat(40),
      transport: "git",
      source: "test.zuni.readiness",
    });
  });

  const first = await provision(gateway, headers);
  assert.equal(first.status, 201, first.body);
  const firstBody = JSON.parse(first.body);

  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.provisioned, true);
  assert.equal(firstBody.productId, "zuni");
  assert.equal(firstBody.status, "active");

  const tenant = await gateway.saasRuntime.getTenant(firstBody.tenantId);
  const workspace = await gateway.saasRuntime.getWorkspace(firstBody.workspaceId);
  const subscription = await gateway.saasRuntime.getSubscription(firstBody.subscriptionId);
  const entitlement = await gateway.saasRuntime.getEntitlement(firstBody.entitlementId);
  const job = await gateway.saasRuntime.getProvisioningJob(firstBody.provisioningJobId);

  assert.equal(tenant.status, "active");
  assert.equal(workspace.status, "active");
  assert.equal(workspace.tenantId, tenant.tenantId);
  assert.equal(workspace.productId, "zuni");
  assert.equal(subscription.status, "active");
  assert.equal(entitlement.status, "active");
  assert.equal(job.status, "succeeded");
  assert.equal(job.result.tenantReady, true);
  assert.equal(job.result.workspaceReady, true);
  assert.equal(job.result.productReady, true);
  assert.match(job.result.evidenceId, /^evidence:zuni:readiness:[a-f0-9]{64}$/);
  assert.equal(job.result.mode, "zuni_operational_readiness");
  assert.equal(probeCalls, 1);

  const second = await provision(gateway, headers);
  assert.equal(second.status, 201, second.body);
  const secondBody = JSON.parse(second.body);

  assert.equal(secondBody.provisioningJobId, firstBody.provisioningJobId);
  assert.equal(secondBody.accessGrantId, firstBody.accessGrantId);
  assert.equal(probeCalls, 1, "succeeded idempotent retry must not reprobe/reprovision");
});

test("operational composition fails closed when Zuni product readiness is false", async (t) => {
  let probeCalls = 0;
  const { gateway, headers } = await createHarness(t, async () => {
    probeCalls += 1;
    return Object.freeze({
      ready: false,
      code: "zuni_not_ready",
      source: "test.zero_.readiness",
    });
  });

  const request = requestBody({
    tenantSlug: "e2e-zuni-blocked",
    idempotencyKey: "e2e-zuni-provision-blocked-001",
  });
  const response = await provision(gateway, headers, request);
  const body = JSON.parse(response.body);

  assert.equal(response.status, 409, response.body);
  assert.equal(body.ok, false);
  assert.equal(body.reason, "provisioning_failed");
  assert.equal(Object.prototype.hasOwnProperty.call(body, "accessGrantId"), false);
  assert.equal(probeCalls, 1);

  const tenantId = "component.tenant.e2e-zuni-blocked";
  const jobs = await gateway.saasRuntime.listProvisioningJobs({ tenantId });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].tenantId, tenantId);
  assert.equal(jobs[0].status, "running");
  assert.equal(jobs[0].result, undefined);
});
