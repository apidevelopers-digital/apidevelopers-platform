import {
  assertCanonicalId,
  createCanonicalId,
} from "./canonical-ids.mjs";
import {
  assertSubscriptionEntitlementBinding,
} from "./saas-commercial.mjs";

export const provisioningJobContractVersion = 1;

export const provisioningJobStatuses = Object.freeze([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

const STATUS_SET = new Set(provisioningJobStatuses);

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertIsoDate(value, name) {
  assertNonEmptyString(value, name);
  if (Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be an ISO-8601 date`);
  }
}

function assertStatus(value) {
  if (!STATUS_SET.has(value)) {
    throw new TypeError("status is invalid");
  }
}

function assertOptionalIsoDate(value, name) {
  if (value !== null) {
    assertIsoDate(value, name);
  }
}

function assertCanonicalComponentId(value, name) {
  try {
    assertCanonicalId(value, { expectedFamily: "component" });
  } catch (error) {
    throw new TypeError(`${name} must be a canonical component id`, { cause: error });
  }
}

export function createProvisioningJob({
  provisioningJobId,
  subscriptionId,
  tenantId,
  workspaceId,
  productId,
  entitlementIds,
  idempotencyKey,
  status = "queued",
  attempt = 0,
  requestedAt = new Date().toISOString(),
  startedAt = null,
  completedAt = null,
  errorCode = null,
  result = null,
} = {}) {
  assertCanonicalComponentId(provisioningJobId, "provisioningJobId");
  assertCanonicalComponentId(subscriptionId, "subscriptionId");
  assertCanonicalComponentId(tenantId, "tenantId");
  assertCanonicalComponentId(workspaceId, "workspaceId");
  assertNonEmptyString(productId, "productId");
  assertNonEmptyString(idempotencyKey, "idempotencyKey");
  assertStatus(status);
  assertIsoDate(requestedAt, "requestedAt");
  assertOptionalIsoDate(startedAt, "startedAt");
  assertOptionalIsoDate(completedAt, "completedAt");

  if (!Array.isArray(entitlementIds) || entitlementIds.length === 0) {
    throw new TypeError("entitlementIds must contain at least one entitlement id");
  }
  const uniqueEntitlementIds = [...new Set(entitlementIds)];
  if (uniqueEntitlementIds.length !== entitlementIds.length) {
    throw new TypeError("entitlementIds must not contain duplicates");
  }
  for (const entitlementId of uniqueEntitlementIds) {
    assertCanonicalComponentId(entitlementId, "entitlementId");
  }

  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new TypeError("attempt must be a non-negative integer");
  }
  if (status === "queued" && startedAt !== null) {
    throw new TypeError("queued provisioning job cannot have startedAt");
  }
  if (status === "running" && startedAt === null) {
    throw new TypeError("running provisioning job requires startedAt");
  }
  if ((status === "succeeded" || status === "failed" || status === "cancelled") && completedAt === null) {
    throw new TypeError(`${status} provisioning job requires completedAt`);
  }
  if (status === "succeeded" && (result === null || typeof result !== "object" || Array.isArray(result))) {
    throw new TypeError("succeeded provisioning job requires object result");
  }
  if (status === "failed") {
    assertNonEmptyString(errorCode, "errorCode");
  }
  if (status !== "failed" && errorCode !== null) {
    throw new TypeError("errorCode is only allowed for failed provisioning jobs");
  }

  return Object.freeze({
    schemaVersion: provisioningJobContractVersion,
    provisioningJobId,
    subscriptionId,
    tenantId,
    workspaceId,
    productId: productId.trim().toLowerCase(),
    entitlementIds: Object.freeze(uniqueEntitlementIds),
    idempotencyKey: idempotencyKey.trim(),
    status,
    attempt,
    requestedAt,
    startedAt,
    completedAt,
    errorCode,
    result: result === null ? null : Object.freeze({ ...result }),
  });
}

export function assertProvisioningJobInputs(subscription, entitlements, provisioningJob) {
  if (!subscription || typeof subscription !== "object") {
    throw new TypeError("subscription must be an object");
  }
  if (!Array.isArray(entitlements) || entitlements.length === 0) {
    throw new TypeError("entitlements must contain at least one entitlement");
  }
  if (!provisioningJob || typeof provisioningJob !== "object") {
    throw new TypeError("provisioningJob must be an object");
  }

  if (provisioningJob.subscriptionId !== subscription.subscriptionId) {
    throw new Error("provisioning subscription boundary mismatch");
  }
  if (provisioningJob.tenantId !== subscription.tenantId) {
    throw new Error("provisioning tenant boundary mismatch");
  }
  if (provisioningJob.productId !== subscription.productId) {
    throw new Error("provisioning product boundary mismatch");
  }
  if (!["assisted_activation", "trial", "active"].includes(subscription.status)) {
    throw new Error("subscription status is not provisionable");
  }

  const expectedIds = new Set(provisioningJob.entitlementIds);
  if (expectedIds.size !== entitlements.length) {
    throw new Error("provisioning entitlement set mismatch");
  }

  for (const entitlement of entitlements) {
    assertSubscriptionEntitlementBinding(subscription, entitlement);
    if (entitlement.workspaceId !== provisioningJob.workspaceId) {
      throw new Error("provisioning workspace boundary mismatch");
    }
    if (!expectedIds.has(entitlement.entitlementId)) {
      throw new Error("provisioning entitlement set mismatch");
    }
    if (!["pending", "active"].includes(entitlement.status)) {
      throw new Error("entitlement status is not provisionable");
    }
  }

  return true;
}

export function transitionProvisioningJob(job, {
  status,
  at = new Date().toISOString(),
  errorCode = null,
  result = null,
} = {}) {
  if (!job || typeof job !== "object") {
    throw new TypeError("job must be an object");
  }
  assertStatus(status);
  assertIsoDate(at, "at");

  const transitions = {
    queued: new Set(["running", "cancelled"]),
    running: new Set(["succeeded", "failed", "cancelled"]),
    failed: new Set(["queued"]),
    succeeded: new Set(),
    cancelled: new Set(),
  };
  const allowed = transitions[job.status];
  if (!allowed || !allowed.has(status)) {
    throw new Error(`invalid provisioning transition ${job.status} -> ${status}`);
  }

  if (job.status === "failed" && status === "queued") {
    return createProvisioningJob({
      ...job,
      status: "queued",
      attempt: job.attempt + 1,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      result: null,
    });
  }

  if (status === "running") {
    return createProvisioningJob({
      ...job,
      status,
      startedAt: at,
      completedAt: null,
      errorCode: null,
      result: null,
    });
  }

  return createProvisioningJob({
    ...job,
    status,
    completedAt: at,
    errorCode: status === "failed" ? errorCode : null,
    result: status === "succeeded" ? result : null,
  });
}

export function createProvisioningJobId(tenantSlug, workspaceSlug, productId) {
  assertNonEmptyString(tenantSlug, "tenantSlug");
  assertNonEmptyString(workspaceSlug, "workspaceSlug");
  assertNonEmptyString(productId, "productId");
  return createCanonicalId({
    family: "component",
    segments: [
      "provisioning",
      tenantSlug.trim().toLowerCase(),
      workspaceSlug.trim().toLowerCase(),
      productId.trim().toLowerCase(),
    ],
  });
}
