import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createCanonicalId } from "@apidevelopers/contracts";

import { createOperationalTrustEvaluationGateway } from "../src/operational-trust-evaluation-composition.mjs";

const NOW = "2026-08-14T06:50:00.000Z";
const SECRET = "trust_eval_0123456789abcdefghijklmnopqrstuvwxyz";
const ORGANIZATION_ID = createCanonicalId({
  family: "component",
  segments: ["organization", "secure-handoff"],
});

async function fixture(options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trust-eval-handoff-"));
  const stateFilePath = path.join(dir, "state.json");
  let writeCounter = 0;

  const gateway = createOperationalTrustEvaluationGateway({
    stateFilePath,
    clock: () => NOW,
    writeIdFactory: () => `write-${++writeCounter}`,
    apiKeyIdFactory: () => "apikey-evaluation-secure-handoff",
    generateKey: () => SECRET,
    assertTenantOperational: async () => true,
    ...options,
  });

  return { dir, gateway };
}

function adminIdentity() {
  return Object.freeze({
    role: "admin",
    principal: Object.freeze({
      id: "platform-admin",
      name: "Platform Administrator",
      status: "active",
      scopes: Object.freeze(["admin:*"]),
    }),
  });
}

test("operational Evaluation has no operator provisioning surface without secure handoff injection", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  assert.equal("evaluationOperatorProvisioning" in fx.gateway, false);
  assert.equal(typeof fx.gateway.evaluationTenantService.createEvaluation, "function");
  assert.equal(typeof fx.gateway.evaluationHttp.handleRequest, "function");
});

test("explicit secure handoff injection enables operator-only provisioning and delivers the secret once", async (t) => {
  const deliveries = [];
  const fx = await fixture({
    credentialHandoff: Object.freeze({
      async deliver(payload) {
        deliveries.push(structuredClone(payload));
      },
    }),
  });
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  assert.equal(typeof fx.gateway.evaluationOperatorProvisioning?.provision, "function");

  const first = await fx.gateway.evaluationOperatorProvisioning.provision({
    identity: adminIdentity(),
    organizationId: ORGANIZATION_ID,
    slug: "secure-handoff",
    displayName: "Secure Handoff Evaluation",
    correlationId: "corr-secure-handoff-1",
  });

  assert.equal(first.created, true);
  assert.equal(first.secretDelivered, true);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].secret, SECRET);
  assert.equal(deliveries[0].tenantId, first.tenantId);
  assert.equal(deliveries[0].apiKeyId, first.apiKeyId);
  assert.equal("secret" in first, false);
  assert.equal("hash" in first, false);
  assert.equal(first.controls.financialEgress, "blocked");
  assert.equal(first.controls.realMoney, false);
  assert.equal(first.controls.biometricMaterialAccepted, false);

  const second = await fx.gateway.evaluationOperatorProvisioning.provision({
    identity: adminIdentity(),
    organizationId: ORGANIZATION_ID,
    slug: "secure-handoff",
    displayName: "Secure Handoff Evaluation",
    correlationId: "corr-secure-handoff-2",
  });

  assert.equal(second.created, false);
  assert.equal(second.secretDelivered, false);
  assert.equal(deliveries.length, 1);
});
