import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryProvisioningRepository,
} from "../src/index.mjs";
import {
  project,
  request,
  service,
  start,
} from "./helpers.mjs";

test("repository is append-only, sequential and source-event idempotent", () => {
  const repo = createMemoryProvisioningRepository();
  const first = request(service()).snapshot;
  assert.equal(repo.append(first).appended, true);
  assert.equal(
    repo.append({ ...first, snapshotId: "other" }).appended,
    false,
  );
  assert.throws(
    () =>
      repo.append({
        ...first,
        snapshotId: "snap-x",
        sourceEventId: "other-event",
        revision: 3,
      }),
    (error) => error.code === "invalid_provisioning_revision",
  );
});

test("provisions tenant, project and public API key in strict order", () => {
  const s = service();
  project(s);
  const key = s.recordApiKeyIssued({
    provisioningId: "prov-1",
    sourceEventId: "apikey-1",
    apiKeyId: "key-1",
    prefix: "apid_example",
  });
  assert.equal(key.snapshot.currentStep, "finalize");
  assert.equal(key.snapshot.apikey.prefix, "apid_example");
  assert.equal("secret" in key.snapshot.apikey, false);

  const completed = s.completeProvisioning({
    provisioningId: "prov-1",
    sourceEventId: "complete-1",
  });
  assert.equal(completed.snapshot.status, "completed");
  assert.equal(completed.events[0].type, "provisioning.completed");
  assert.equal(completed.events[0].data.apiKeyId, "key-1");
});

test("rejects out-of-order resource completion", () => {
  const s = service();
  start(s);
  assert.throws(
    () =>
      s.recordProjectProvisioned({
        provisioningId: "prov-1",
        sourceEventId: "project-early",
        projectId: "project-1",
      }),
    (error) => error.code === "invalid_provisioning_step",
  );
  assert.throws(
    () =>
      s.completeProvisioning({
        provisioningId: "prov-1",
        sourceEventId: "complete-early",
      }),
    (error) => error.code === "invalid_provisioning_step",
  );
});

test("creates reverse compensation plan and blocks retry until complete", () => {
  const s = service();
  project(s);
  const failed = s.failProvisioning({
    provisioningId: "prov-1",
    sourceEventId: "failure-1",
    step: "apikey",
    code: "provider_timeout",
    message: "provider timed out",
    retryable: true,
  });
  assert.deepEqual(
    failed.snapshot.compensation.map((item) => item.action),
    ["delete_project", "cancel_tenant"],
  );
  assert.throws(
    () =>
      s.retryProvisioning({
        provisioningId: "prov-1",
        sourceEventId: "retry-early",
      }),
    (error) => error.code === "compensation_incomplete",
  );
});

test("records compensation and retries with a clean resource state", () => {
  const s = service();
  project(s);
  let failed = s.failProvisioning({
    provisioningId: "prov-1",
    sourceEventId: "failure-1",
    step: "apikey",
    code: "provider_timeout",
    message: "provider timed out",
    retryable: true,
  }).snapshot;

  for (const action of failed.compensation) {
    failed = s.recordCompensation({
      provisioningId: "prov-1",
      sourceEventId: `compensate-${action.id}`,
      actionId: action.id,
    }).snapshot;
  }
  assert.equal(failed.project.status, "compensated");
  assert.equal(failed.tenant.status, "compensated");

  const retry = s.retryProvisioning({
    provisioningId: "prov-1",
    sourceEventId: "retry-1",
  });
  assert.equal(retry.snapshot.status, "requested");
  assert.equal(retry.snapshot.tenant.status, "pending");
  assert.equal(retry.snapshot.project.status, "pending");
  assert.equal(retry.snapshot.apikey.status, "pending");

  const restarted = s.startProvisioning({
    provisioningId: "prov-1",
    sourceEventId: "start-2",
  });
  assert.equal(restarted.snapshot.attempt, 2);
});

test("deduplicates repeated external events", () => {
  const s = service();
  start(s);
  const first = s.recordTenantProvisioned({
    provisioningId: "prov-1",
    sourceEventId: "tenant-webhook-1",
    tenantId: "tenant-1",
  });
  const repeated = s.recordTenantProvisioned({
    provisioningId: "prov-1",
    sourceEventId: "tenant-webhook-1",
    tenantId: "ignored",
  });
  assert.equal(repeated.appended, false);
  assert.equal(repeated.snapshot.snapshotId, first.snapshot.snapshotId);
  assert.deepEqual(repeated.events, []);
});

test("cancels requested provisioning and blocks terminal transitions", () => {
  const s = service();
  request(s);
  const cancelled = s.cancelProvisioning({
    provisioningId: "prov-1",
    sourceEventId: "cancel-1",
    reason: "customer_request",
  });
  assert.equal(cancelled.snapshot.status, "cancelled");
  assert.deepEqual(
    s.listCurrentByAccount("account-1").map((item) => item.status),
    ["cancelled"],
  );
  assert.throws(
    () =>
      s.startProvisioning({
        provisioningId: "prov-1",
        sourceEventId: "start-late",
      }),
    (error) => error.code === "terminal_provisioning",
  );
});
