import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createCanonicalId } from "@apidevelopers/contracts";

import {
  createTrustEvaluationCredentialEnvelopeHandoff,
  openTrustEvaluationCredentialEnvelope,
} from "../src/global-trust-evaluation-credential-envelope.mjs";
import { createOperationalTrustEvaluationGateway } from "../src/operational-trust-evaluation-composition.mjs";

const NOW = "2026-08-14T07:00:00.000Z";
const SECRET = "trust_eval_integrated_0123456789abcdefghijklmnopqrstuvwxyz";
const ORGANIZATION_ID = createCanonicalId({
  family: "component",
  segments: ["organization", "sealed-handoff"],
});

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

function rsaPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trust-eval-envelope-integration-"));
  const stateFilePath = path.join(dir, "state.json");
  let writeCounter = 0;
  const keys = rsaPair();
  const envelopes = [];

  const credentialHandoff = createTrustEvaluationCredentialEnvelopeHandoff({
    recipientPublicKey: keys.publicKey,
    async deliverEnvelope(envelope) {
      envelopes.push(structuredClone(envelope));
    },
  });

  const gateway = createOperationalTrustEvaluationGateway({
    stateFilePath,
    clock: () => NOW,
    writeIdFactory: () => `write-${++writeCounter}`,
    apiKeyIdFactory: () => "apikey-evaluation-sealed-handoff",
    generateKey: () => SECRET,
    assertTenantOperational: async () => true,
    credentialHandoff,
  });

  return { dir, gateway, keys, envelopes };
}

test("operator provisioning seals first credential for customer key and never re-delivers on retry", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  assert.equal(typeof fx.gateway.evaluationOperatorProvisioning?.provision, "function");

  const first = await fx.gateway.evaluationOperatorProvisioning.provision({
    identity: adminIdentity(),
    organizationId: ORGANIZATION_ID,
    slug: "sealed-handoff",
    displayName: "Sealed Handoff Evaluation",
    correlationId: "corr-sealed-handoff-001",
  });

  assert.equal(first.created, true);
  assert.equal(first.secretDelivered, true);
  assert.equal("secret" in first, false);
  assert.equal("hash" in first, false);
  assert.equal(first.controls.financialEgress, "blocked");
  assert.equal(first.controls.realMoney, false);
  assert.equal(first.controls.biometricMaterialAccepted, false);
  assert.equal(fx.envelopes.length, 1);

  const [envelope] = fx.envelopes;
  const serialized = JSON.stringify(envelope);
  assert.equal(serialized.includes(SECRET), false);
  assert.equal(serialized.includes("PRIVATE KEY"), false);
  assert.equal(envelope.context.tenantId, first.tenantId);
  assert.equal(envelope.context.apiKeyId, first.apiKeyId);
  assert.equal(envelope.context.expiresAt, first.expiresAt);
  assert.equal(envelope.context.correlationId, "corr-sealed-handoff-001");

  assert.equal(
    openTrustEvaluationCredentialEnvelope({
      envelope,
      recipientPrivateKey: fx.keys.privateKey,
    }),
    SECRET,
  );

  const second = await fx.gateway.evaluationOperatorProvisioning.provision({
    identity: adminIdentity(),
    organizationId: ORGANIZATION_ID,
    slug: "sealed-handoff",
    displayName: "Sealed Handoff Evaluation",
    correlationId: "corr-sealed-handoff-002",
  });

  assert.equal(second.created, false);
  assert.equal(second.secretDelivered, false);
  assert.equal(fx.envelopes.length, 1);
});

test("sealed envelope integration keeps authenticated Evaluation GET usable with the issued credential", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const receipt = await fx.gateway.evaluationOperatorProvisioning.provision({
    identity: adminIdentity(),
    organizationId: ORGANIZATION_ID,
    slug: "sealed-handoff",
    displayName: "Sealed Handoff Evaluation",
    correlationId: "corr-sealed-handoff-003",
  });

  const issuedSecret = openTrustEvaluationCredentialEnvelope({
    envelope: fx.envelopes[0],
    recipientPrivateKey: fx.keys.privateKey,
  });

  const response = await fx.gateway.app.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation",
    headers: {
      "x-tenant-id": receipt.tenantId,
      "x-api-key": issuedSecret,
    },
  });

  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.allowed, true);
  assert.equal(body.evaluation.tenantId, receipt.tenantId);
  assert.equal(body.evaluation.environment, "sandbox");
  assert.equal(body.evaluation.controls.financialEgress, "blocked");
  assert.equal(body.evaluation.controls.realMoney, false);
  assert.equal("secret" in body.evaluation, false);
  assert.equal("apiKeyId" in body.evaluation, false);
  assert.equal("apiKeyPrefix" in body.evaluation, false);
});
