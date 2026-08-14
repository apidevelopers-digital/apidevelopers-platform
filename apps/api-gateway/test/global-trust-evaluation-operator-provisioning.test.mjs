import assert from "node:assert/strict";
import test from "node:test";

import {
  createGlobalTrustEvaluationOperatorProvisioningService as createService,
} from "../src/global-trust-evaluation-operator-provisioning.mjs";

const secret = "trust_eval_0123456789abcdefghijklmnopqrstuvwxyz";
const admin = {
  role: "admin",
  principal: {
    id: "platform-admin",
    status: "active",
    scopes: ["admin:*"],
  },
};

const evalResult = (issued = true) => ({
  created: issued,
  evaluation: {
    tenantId: "component.tenant.acme",
    workspaceId: "component.workspace.acme.evaluation",
    subscriptionId: "component.subscription.acme.trust",
    productId: "trust",
    planId: "evaluation",
    environment: "sandbox",
    status: "active",
    expiresAt: "2026-08-28T06:30:00.000Z",
    apiKeyId: "api-key-eval",
    apiKeyPrefix: secret.slice(0, 12),
    scopes: ["trust:evaluate"],
    capabilities: ["trust-evaluate"],
    limits: { requestsPerMinute: 60, maxAmountMinor: 100000 },
    controls: {
      financialEgress: "blocked",
      realMoney: false,
      biometricMaterialAccepted: false,
    },
  },
  apiKey: { id: "api-key-eval", prefix: secret.slice(0, 12) },
  secret: issued ? secret : null,
  secretIssued: issued,
});

function fixture({ issued = true, failHandoff = false } = {}) {
  const audits = [];
  const deliveries = [];
  let creates = 0;

  const service = createService({
    evaluationTenantService: {
      async createEvaluation() {
        creates += 1;
        return evalResult(issued);
      },
    },
    audit: {
      async recordOperatorCapabilityResult(event) {
        audits.push(structuredClone(event));
        return event;
      },
    },
    credentialHandoff: {
      async deliver(payload) {
        deliveries.push(structuredClone(payload));
        if (failHandoff) throw new Error("handoff failed");
      },
    },
  });

  return { service, audits, deliveries, creates: () => creates };
}

const req = (identity = admin, correlationId = "corr-1") => ({
  identity,
  organizationId: "component.organization.acme",
  slug: "acme",
  displayName: "ACME",
  correlationId,
});

test("operator provisioning hands off first secret once and never returns or audits it", async () => {
  const f = fixture();
  const receipt = await f.service.provision(req());

  assert.equal(f.deliveries.length, 1);
  assert.equal(f.deliveries[0].secret, secret);
  assert.equal(receipt.secretDelivered, true);
  assert.equal("secret" in receipt, false);
  assert.equal("hash" in receipt, false);
  assert.equal(receipt.controls.financialEgress, "blocked");
  assert.equal(receipt.controls.realMoney, false);

  assert.equal(f.audits.length, 1);
  assert.equal(f.audits[0].outcome, "success");
  assert.equal(f.audits[0].metadata.credentialDelivered, true);
  assert.equal("secretDelivered" in f.audits[0].metadata, false);
  assert.equal("apiKeyId" in f.audits[0].metadata, false);
  assert.equal("apiKeyPrefix" in f.audits[0].metadata, false);
  assert.equal(JSON.stringify(f.audits[0]).includes(secret), false);
});

test("idempotent operator provisioning never re-hands-off a secret", async () => {
  const f = fixture({ issued: false });
  const receipt = await f.service.provision(req(admin, "corr-2"));

  assert.equal(f.deliveries.length, 0);
  assert.equal(receipt.secretDelivered, false);
  assert.equal(f.audits[0].metadata.credentialDelivered, false);
});

test("non-admin is rejected before tenant creation", async () => {
  const f = fixture();
  const client = {
    role: "client",
    principal: { id: "c1", status: "active", scopes: ["trust:evaluate"] },
  };

  await assert.rejects(
    f.service.provision(req(client, "corr-3")),
    (error) => error.code === "TRUST_EVALUATION_OPERATOR_FORBIDDEN",
  );
  assert.equal(f.creates(), 0);
  assert.equal(f.deliveries.length, 0);
  assert.equal(f.audits.length, 0);
});

test("handoff failure is audited without sensitive metadata and requires recovery", async () => {
  const f = fixture({ failHandoff: true });

  await assert.rejects(
    f.service.provision(req(admin, "corr-4")),
    (error) => error.code === "TRUST_EVALUATION_OPERATOR_HANDOFF_FAILED",
  );

  assert.equal(f.audits.length, 1);
  assert.equal(f.audits[0].outcome, "failed");
  assert.equal(f.audits[0].metadata.credentialDelivered, false);
  assert.equal(f.audits[0].metadata.errorCode, "credential_handoff_failed");
  assert.equal("secretDelivered" in f.audits[0].metadata, false);
  assert.equal(JSON.stringify(f.audits[0]).includes(secret), false);
});
