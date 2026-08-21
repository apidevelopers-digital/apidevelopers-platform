import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  TRUST_SANDBOX_PROVISIONING_CONTRACT,
  TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT,
  TRUST_SANDBOX_VERIFICATION_READ_CONTRACT,
} from "@apidevelopers/contracts";

import { createOperationalGatewayWithReadonlyOperator } from "../src/operator-readonly-composition.mjs";

const NOW = "2026-08-21T01:50:00.000Z";
const PROVISIONING_KEY = "trust-m2-slice2-provisioning-key-20260821-0001";
const TENANT_A_SECRET = "trust_sk_test_slice2_tenant_a_20260821_abcdefghijklmnopqrstu";
const TENANT_B_SECRET = "trust_sk_test_slice2_tenant_b_20260821_qrstuvwxyzabcdef";

async function provisionTrustTenant(gateway, body) {
  const response = await gateway.app.handleRequest({
    method: "POST",
    url: TRUST_SANDBOX_PROVISIONING_CONTRACT.path,
    headers: {
      "x-api-key": PROVISIONING_KEY,
    },
    body: JSON.stringify(body),
  });

  assert.equal(response.status, 201);
  const payload = JSON.parse(response.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.provisioned, true);
  assert.equal(payload.environment, "sandbox");
  assert.equal(payload.credential.oneTime, true);
  return payload;
}

test("Trust M2 slice 2 uses slice 1 credentials for tenant-scoped sandbox verification create/read", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "trust-m2-slice2-operational-"));
  const stateFilePath = join(directory, "state.json");
  t.after(() => rm(directory, { recursive: true, force: true }));

  const previousProvisioningKey = process.env.API_GATEWAY_PROVISIONING_KEY;
  process.env.API_GATEWAY_PROVISIONING_KEY = PROVISIONING_KEY;
  t.after(() => {
    if (previousProvisioningKey === undefined) {
      delete process.env.API_GATEWAY_PROVISIONING_KEY;
    } else {
      process.env.API_GATEWAY_PROVISIONING_KEY = previousProvisioningKey;
    }
  });

  const secrets = [TENANT_A_SECRET, TENANT_B_SECRET];
  let apiKeySequence = 0;
  let verificationSequence = 0;

  const gateway = createOperationalGatewayWithReadonlyOperator({
    stateFilePath,
    clock: () => NOW,
    writeIdFactory: () => `trust-m2-slice2-write-${apiKeySequence}-${verificationSequence}`,
    apiKeyIdFactory: () => `trust-m2-slice2-api-key-${++apiKeySequence}`,
    generateKey: () => secrets[apiKeySequence - 1],
    trustVerificationIdFactory: () => `slice2-${++verificationSequence}`,
  });

  const tenantA = await provisionTrustTenant(gateway, {
    tenantSlug: "acme-trust-slice2-a",
    workspaceSlug: "sandbox-main",
    displayName: "Acme Trust Slice 2 A",
  });
  assert.equal(tenantA.credential.secret, TENANT_A_SECRET);

  const createResponse = await gateway.app.handleRequest({
    method: "POST",
    url: TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT.path,
    headers: {
      "x-api-key": tenantA.credential.secret,
      "x-tenant-id": tenantA.tenantId,
    },
    body: JSON.stringify({
      subjectRef: "subject:customer-001",
      modality: "face+liveness",
    }),
  });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.headers["cache-control"], "no-store");

  const created = JSON.parse(createResponse.body).verification;
  assert.equal(created.verificationId, "trust-verification-slice2-1");
  assert.equal(created.tenantId, tenantA.tenantId);
  assert.equal(created.environment, "sandbox");
  assert.equal(created.mode, "mock");
  assert.equal(created.status, "accepted");
  assert.equal(created.adapter, "none");
  assert.equal(created.biometricProcessing, false);
  assert.equal(created.result, null);

  const readResponse = await gateway.app.handleRequest({
    method: "GET",
    url: `${TRUST_SANDBOX_VERIFICATION_READ_CONTRACT.pathPrefix}${encodeURIComponent(created.verificationId)}`,
    headers: {
      "x-api-key": tenantA.credential.secret,
      "x-tenant-id": tenantA.tenantId,
    },
  });

  assert.equal(readResponse.status, 200);
  assert.deepEqual(JSON.parse(readResponse.body).verification, created);

  const wrongTenantHeader = await gateway.app.handleRequest({
    method: "GET",
    url: `${TRUST_SANDBOX_VERIFICATION_READ_CONTRACT.pathPrefix}${encodeURIComponent(created.verificationId)}`,
    headers: {
      "x-api-key": tenantA.credential.secret,
      "x-tenant-id": "component.tenant.other-tenant",
    },
  });
  assert.equal(wrongTenantHeader.status, 401);

  const tenantB = await provisionTrustTenant(gateway, {
    tenantSlug: "acme-trust-slice2-b",
    workspaceSlug: "sandbox-main",
    displayName: "Acme Trust Slice 2 B",
  });
  assert.equal(tenantB.credential.secret, TENANT_B_SECRET);

  const crossTenantRead = await gateway.app.handleRequest({
    method: "GET",
    url: `${TRUST_SANDBOX_VERIFICATION_READ_CONTRACT.pathPrefix}${encodeURIComponent(created.verificationId)}`,
    headers: {
      "x-api-key": tenantB.credential.secret,
      "x-tenant-id": tenantB.tenantId,
    },
  });

  assert.equal(crossTenantRead.status, 404);
  assert.equal(JSON.parse(crossTenantRead.body).reason, "verification_not_found");

  const persisted = await readFile(stateFilePath, "utf8");
  assert.equal(persisted.includes(PROVISIONING_KEY), false);
  assert.equal(persisted.includes(TENANT_A_SECRET), false);
  assert.equal(persisted.includes(TENANT_B_SECRET), false);
  assert.equal(persisted.includes("data:image"), false);
  assert.equal(persisted.includes("biometricTemplate"), false);

  const records = await gateway.trustSandboxVerificationApp.repository.list();
  assert.equal(records.length, 1);
  assert.equal(records[0].tenantId, tenantA.tenantId);
  assert.equal(records[0].adapter, "none");
  assert.equal(records[0].biometricProcessing, false);
});
