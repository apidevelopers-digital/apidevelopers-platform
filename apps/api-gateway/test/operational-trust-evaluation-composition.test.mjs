import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createCanonicalId } from "@apidevelopers/contracts";

import { createOperationalTrustEvaluationGateway } from "../src/operational-trust-evaluation-composition.mjs";

const NOW = "2026-08-14T05:20:00.000Z";
const SECRET = "trust_eval_0123456789abcdefghijklmnopqrstuvwxyz";
const ORGANIZATION_ID = createCanonicalId({
  family: "component",
  segments: ["organization", "acme"],
});

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trust-eval-operational-"));
  const stateFilePath = path.join(dir, "state.json");
  let writeCounter = 0;

  const gateway = createOperationalTrustEvaluationGateway({
    stateFilePath,
    clock: () => NOW,
    writeIdFactory: () => `write-${++writeCounter}`,
    apiKeyIdFactory: () => "apikey-evaluation-operational",
    generateKey: () => SECRET,
    assertTenantOperational: async () => true,
  });

  return { dir, gateway };
}

test("operational Trust Evaluation composition authenticates an issued tenant key end to end", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const provisioned = await fx.gateway.evaluationTenantService.createEvaluation({
    organizationId: ORGANIZATION_ID,
    slug: "acme-operational",
    displayName: "ACME Operational",
  });

  assert.equal(provisioned.created, true);
  assert.equal(provisioned.secretIssued, true);
  assert.equal(provisioned.secret, SECRET);

  const response = await fx.gateway.app.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation",
    headers: {
      "x-tenant-id": provisioned.evaluation.tenantId,
      "x-api-key": provisioned.secret,
    },
  });

  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.allowed, true);
  assert.equal(body.evaluation.tenantId, provisioned.evaluation.tenantId);
  assert.equal(body.evaluation.environment, "sandbox");
  assert.equal(body.evaluation.controls.financialEgress, "blocked");
  assert.equal(body.evaluation.controls.realMoney, false);
  assert.equal(body.evaluation.controls.biometricMaterialAccepted, false);
  assert.equal("secret" in body.evaluation, false);
  assert.equal("apiKeyId" in body.evaluation, false);
  assert.equal("apiKeyPrefix" in body.evaluation, false);
});

test("operational Trust Evaluation composition preserves existing gateway routes", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const response = await fx.gateway.app.handleRequest({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), {
    service: "api-gateway",
    status: "ok",
  });
});

test("operational Trust Evaluation composition rejects a valid key used with another tenant", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const provisioned = await fx.gateway.evaluationTenantService.createEvaluation({
    organizationId: ORGANIZATION_ID,
    slug: "acme-boundary",
    displayName: "ACME Boundary",
  });

  const response = await fx.gateway.app.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation",
    headers: {
      "x-tenant-id": "component.tenant.other",
      "x-api-key": provisioned.secret,
    },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(JSON.parse(response.body), {
    allowed: false,
    reason: "unauthorized",
  });
});
