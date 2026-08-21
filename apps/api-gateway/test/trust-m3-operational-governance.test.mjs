import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  TRUST_SANDBOX_AUDIT_READ_CONTRACT,
  TRUST_SANDBOX_EVIDENCE_READ_CONTRACT,
  TRUST_SANDBOX_GOVERNANCE_PREVIEW_CONTRACT,
  TRUST_SANDBOX_PROVISIONING_CONTRACT,
  TRUST_SANDBOX_SCOPES,
  TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT,
} from "@apidevelopers/contracts";

import { createOperationalGatewayWithReadonlyOperator } from "../src/operator-readonly-composition.mjs";

const NOW = "2026-08-21T05:55:00.000Z";
const PROVISIONING_KEY = "trust-m3-provisioning-key-test-only";
const TENANT_A_SECRET = "trust_sk_m3_tenant_a_test_only_abcdefghijklmnopqrstuvwxyz";
const TENANT_B_SECRET = "trust_sk_m3_tenant_b_test_only_abcdefghijklmnopqrstuvwxyz";

async function provision(gateway, body) {
  const response = await gateway.app.handleRequest({
    method: "POST",
    url: TRUST_SANDBOX_PROVISIONING_CONTRACT.path,
    headers: { "x-api-key": PROVISIONING_KEY },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201);
  return JSON.parse(response.body);
}

test("Trust M3 operational gateway persists governed preview and serves tenant-scoped evidence/audit", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "trust-m3-operational-"));
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
  let secretSequence = 0;
  let apiKeySequence = 0;
  let verificationSequence = 0;
  let governanceSequence = 0;
  let requestSequence = 0;
  let writeSequence = 0;

  const gateway = createOperationalGatewayWithReadonlyOperator({
    stateFilePath,
    clock: () => NOW,
    writeIdFactory: () => `trust-m3-write-${++writeSequence}`,
    apiKeyIdFactory: () => `trust-m3-api-key-${++apiKeySequence}`,
    generateKey: () => secrets[secretSequence++],
    trustVerificationIdFactory: () => `m3-verification-${++verificationSequence}`,
    trustGovernanceIdFactory: () => `m3-governance-${++governanceSequence}`,
    trustGovernanceRequestIdFactory: () => `m3-request-${++requestSequence}`,
  });

  const tenantA = await provision(gateway, {
    tenantSlug: "acme-trust-m3-a",
    workspaceSlug: "sandbox-main",
    displayName: "Acme Trust M3 A",
  });
  assert.equal(tenantA.credential.secret, TENANT_A_SECRET);
  assert.deepEqual(tenantA.credential.scopes, TRUST_SANDBOX_SCOPES);

  const verificationResponse = await gateway.app.handleRequest({
    method: "POST",
    url: TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT.path,
    headers: {
      "x-api-key": tenantA.credential.secret,
      "x-tenant-id": tenantA.tenantId,
    },
    body: JSON.stringify({
      subjectRef: "subject:customer-m3-001",
      modality: "face+liveness",
    }),
  });
  assert.equal(verificationResponse.status, 201);
  const verification = JSON.parse(verificationResponse.body).verification;
  assert.equal(verification.tenantId, tenantA.tenantId);
  assert.equal(verification.adapter, "none");
  assert.equal(verification.biometricProcessing, false);

  const governanceResponse = await gateway.app.handleRequest({
    method: "POST",
    url:
      `${TRUST_SANDBOX_GOVERNANCE_PREVIEW_CONTRACT.pathPrefix}` +
      `${encodeURIComponent(verification.verificationId)}` +
      `${TRUST_SANDBOX_GOVERNANCE_PREVIEW_CONTRACT.pathSuffix}`,
    headers: {
      "x-api-key": tenantA.credential.secret,
      "x-tenant-id": tenantA.tenantId,
    },
  });
  assert.equal(governanceResponse.status, 201);
  assert.equal(governanceResponse.headers["cache-control"], "no-store");

  const preview = JSON.parse(governanceResponse.body).governancePreview;
  assert.equal(preview.tenantId, tenantA.tenantId);
  assert.equal(preview.verificationId, verification.verificationId);
  assert.equal(preview.environment, "sandbox");
  assert.equal(preview.mode, "preview");
  assert.equal(preview.executionObserved, false);
  assert.equal(preview.mutationObserved, false);
  assert.equal(preview.governance.realBiometrics, false);
  assert.equal(preview.governance.decisionReport.mode, "advisory");
  assert.equal(preview.governance.decisionReport.humanApprovalRequired, true);
  assert.equal(preview.governance.policyDecision.dryRun, true);
  assert.equal(preview.governance.runtimeReport.executionObserved, false);
  assert.equal(preview.governance.runtimeReport.mutationObserved, false);
  assert.equal(preview.governance.evidenceRecord.metadata.immutable, true);
  assert.equal(preview.governance.evidenceRecord.metadata.redacted, true);
  assert.equal(preview.governance.auditReport.evidenceVerified, true);
  assert.equal(preview.governance.auditReport.executionAllowed, false);
  assert.equal(preview.governance.auditReport.mutationAllowed, false);

  const evidenceResponse = await gateway.app.handleRequest({
    method: "GET",
    url:
      `${TRUST_SANDBOX_EVIDENCE_READ_CONTRACT.pathPrefix}` +
      `${encodeURIComponent(preview.evidenceId)}`,
    headers: {
      "x-api-key": tenantA.credential.secret,
      "x-tenant-id": tenantA.tenantId,
    },
  });
  assert.equal(evidenceResponse.status, 200);
  const evidence = JSON.parse(evidenceResponse.body).evidence;
  assert.equal(evidence.evidenceId, preview.evidenceId);
  assert.equal(evidence.tenantId, tenantA.tenantId);
  assert.equal(evidence.metadata.immutable, true);
  assert.equal(evidence.metadata.redacted, true);

  const auditResponse = await gateway.app.handleRequest({
    method: "GET",
    url:
      `${TRUST_SANDBOX_AUDIT_READ_CONTRACT.pathPrefix}` +
      `${encodeURIComponent(preview.auditId)}`,
    headers: {
      "x-api-key": tenantA.credential.secret,
      "x-tenant-id": tenantA.tenantId,
    },
  });
  assert.equal(auditResponse.status, 200);
  const audit = JSON.parse(auditResponse.body).audit;
  assert.equal(audit.auditId, preview.auditId);
  assert.equal(audit.tenantId, tenantA.tenantId);
  assert.equal(audit.evidenceVerified, true);
  assert.equal(audit.executionAllowed, false);
  assert.equal(audit.mutationAllowed, false);

  const mismatch = await gateway.app.handleRequest({
    method: "GET",
    url:
      `${TRUST_SANDBOX_EVIDENCE_READ_CONTRACT.pathPrefix}` +
      `${encodeURIComponent(preview.evidenceId)}`,
    headers: {
      "x-api-key": tenantA.credential.secret,
      "x-tenant-id": "component.tenant.other",
    },
  });
  assert.equal(mismatch.status, 401);

  const tenantB = await provision(gateway, {
    tenantSlug: "acme-trust-m3-b",
    workspaceSlug: "sandbox-main",
    displayName: "Acme Trust M3 B",
  });
  assert.equal(tenantB.credential.secret, TENANT_B_SECRET);

  const crossTenantEvidence = await gateway.app.handleRequest({
    method: "GET",
    url:
      `${TRUST_SANDBOX_EVIDENCE_READ_CONTRACT.pathPrefix}` +
      `${encodeURIComponent(preview.evidenceId)}`,
    headers: {
      "x-api-key": tenantB.credential.secret,
      "x-tenant-id": tenantB.tenantId,
    },
  });
  assert.equal(crossTenantEvidence.status, 404);

  const crossTenantAudit = await gateway.app.handleRequest({
    method: "GET",
    url:
      `${TRUST_SANDBOX_AUDIT_READ_CONTRACT.pathPrefix}` +
      `${encodeURIComponent(preview.auditId)}`,
    headers: {
      "x-api-key": tenantB.credential.secret,
      "x-tenant-id": tenantB.tenantId,
    },
  });
  assert.equal(crossTenantAudit.status, 404);

  const governanceRecords = await gateway.trustSandboxGovernanceApp.repository.list();
  assert.equal(governanceRecords.length, 1);
  assert.equal(governanceRecords[0].roundTripId, preview.roundTripId);
  assert.equal(governanceRecords[0].tenantId, tenantA.tenantId);

  const persisted = await readFile(stateFilePath, "utf8");
  for (const secret of [PROVISIONING_KEY, TENANT_A_SECRET, TENANT_B_SECRET]) {
    assert.equal(persisted.includes(secret), false);
  }
  assert.equal(persisted.includes("data:image"), false);
  assert.equal(persisted.includes("biometricTemplate"), false);
  assert.equal(persisted.includes("provider-real"), false);
});
