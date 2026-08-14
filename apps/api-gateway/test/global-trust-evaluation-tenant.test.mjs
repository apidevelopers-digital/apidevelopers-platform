import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createApiKeyLifecycleService,
  createDurableApiKeyRepository,
} from "@apidevelopers/apikey-core";
import { createCanonicalId } from "@apidevelopers/contracts";
import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createSaasRuntime } from "@apidevelopers/saas-runtime";

import {
  TRUST_EVALUATION_API_SCOPES,
  TRUST_EVALUATION_CAPABILITIES,
  createGlobalTrustEvaluationTenantService,
} from "../src/global-trust-evaluation-tenant.mjs";

const START = "2026-08-14T04:00:00.000Z";
const SECRET = "trust_eval_0123456789abcdefghijklmnopqrstuvwxyz";
const ORGANIZATION_ID = createCanonicalId({
  family: "component",
  segments: ["organization", "acme"],
});

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trust-evaluation-"));
  const filePath = path.join(dir, "state.json");
  let now = START;

  const store = createJsonFileStore({
    filePath,
    clock: () => now,
    idFactory: () => "write-fixed",
  });

  const saasRuntime = createSaasRuntime({
    store,
    clock: () => now,
  });

  const apiKeyRepository = createDurableApiKeyRepository({ store });
  const apiKeyLifecycle = createApiKeyLifecycleService({
    repository: apiKeyRepository,
    clock: () => now,
    idFactory: () => "apikey-evaluation",
    generateKey: () => SECRET,
    assertTenantOperational: async () => true,
  });

  const service = createGlobalTrustEvaluationTenantService({
    store,
    saasRuntime,
    apiKeyLifecycle,
    clock: () => now,
  });

  return {
    dir,
    filePath,
    store,
    saasRuntime,
    apiKeyLifecycle,
    service,
    setNow(value) {
      now = value;
    },
  };
}

test("provisions an isolated Trust evaluation tenant and returns its API secret once", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const first = await fx.service.createEvaluation({
    organizationId: ORGANIZATION_ID,
    slug: "acme-demo",
    displayName: "ACME Demo",
  });

  assert.equal(first.created, true);
  assert.equal(first.secretIssued, true);
  assert.equal(first.secret, SECRET);
  assert.equal(first.evaluation.environment, "sandbox");
  assert.equal(first.evaluation.status, "active");
  assert.equal(first.evaluation.controls.financialEgress, "blocked");
  assert.equal(first.evaluation.controls.realMoney, false);
  assert.equal(first.evaluation.controls.biometricMaterialAccepted, false);
  assert.deepEqual(first.evaluation.capabilities, TRUST_EVALUATION_CAPABILITIES);
  assert.deepEqual(first.evaluation.scopes, TRUST_EVALUATION_API_SCOPES);
  assert.equal(first.apiKey.status, "active");
  assert.equal("hash" in first.apiKey, false);
  assert.equal("keyHash" in first.apiKey, false);

  const subscription = await fx.saasRuntime.getSubscription(first.evaluation.subscriptionId);
  assert.equal(subscription.status, "trial");
  assert.equal(subscription.monthlyAmount, 0);
  assert.equal(subscription.productId, "trust");
  assert.equal(subscription.planId, "evaluation");

  for (const capability of TRUST_EVALUATION_CAPABILITIES) {
    const entitlement = first.evaluation.capabilities.includes(capability)
      ? true
      : false;
    assert.equal(entitlement, true);
  }

  const second = await fx.service.createEvaluation({
    organizationId: ORGANIZATION_ID,
    slug: "acme-demo",
    displayName: "ACME Demo",
  });

  assert.equal(second.created, false);
  assert.equal(second.secretIssued, false);
  assert.equal(second.secret, null);

  const keys = await fx.apiKeyLifecycle.listApiKeys(first.evaluation.tenantId);
  assert.equal(keys.length, 1);
  assert.equal(keys[0].status, "active");
});

test("persists only hashed API-key material and never raw biometric material", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const created = await fx.service.createEvaluation({
    organizationId: ORGANIZATION_ID,
    slug: "secure-demo",
    displayName: "Secure Demo",
  });

  const snapshot = await readFile(fx.filePath, "utf8");
  assert.equal(snapshot.includes(created.secret), false);
  assert.equal(snapshot.toLowerCase().includes("face image"), false);
  assert.equal(snapshot.toLowerCase().includes("iris scan"), false);
  assert.equal(snapshot.toLowerCase().includes("palm image"), false);
  assert.equal(snapshot.includes('"realMoney":false'), true);
  assert.equal(snapshot.includes('"financialEgress":"blocked"'), true);
});

test("fails closed after expiry and revokes the evaluation API key", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const created = await fx.service.createEvaluation({
    organizationId: ORGANIZATION_ID,
    slug: "expiry-demo",
    displayName: "Expiry Demo",
    ttlMs: 24 * 60 * 60 * 1000,
  });

  const before = await fx.service.assertEvaluationActive(created.evaluation.tenantId);
  assert.equal(before.status, "active");

  fx.setNow("2026-08-15T04:00:00.001Z");

  await assert.rejects(
    fx.service.assertEvaluationActive(created.evaluation.tenantId),
    (error) => error.code === "TRUST_EVALUATION_EXPIRED",
  );

  const expired = await fx.service.expireEvaluation({
    tenantId: created.evaluation.tenantId,
    reason: "ttl_elapsed",
  });
  assert.equal(expired.status, "expired");

  const keys = await fx.apiKeyLifecycle.listApiKeys(created.evaluation.tenantId);
  assert.equal(keys.length, 1);
  assert.equal(keys[0].status, "revoked");
});

test("rejects unsafe evaluation limits before issuing credentials", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  await assert.rejects(
    fx.service.createEvaluation({
      organizationId: ORGANIZATION_ID,
      slug: "ttl-too-long",
      displayName: "TTL Too Long",
      ttlMs: 31 * 24 * 60 * 60 * 1000,
    }),
    (error) => error.code === "TRUST_EVALUATION_INVALID_TTL",
  );

  await assert.rejects(
    fx.service.createEvaluation({
      organizationId: ORGANIZATION_ID,
      slug: "rate-too-high",
      displayName: "Rate Too High",
      limits: { requestsPerMinute: 601 },
    }),
    (error) => error.code === "TRUST_EVALUATION_INVALID_LIMIT",
  );
});
