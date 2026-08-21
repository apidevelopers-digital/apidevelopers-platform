import test from "node:test";
import assert from "node:assert/strict";

import { createTenantContext } from "@apidevelopers/contracts";
import { verifyEvidence } from "@apidevelopers/kernel-evidence";
import { runTrustGovernancePreview } from "../src/index.mjs";

const NOW = "2026-08-21T05:05:00.000Z";

function ids() {
  let sequence = 0;
  return () => `id-${++sequence}`;
}

function tenantContext(tenantId = "component.tenant.trust-preview") {
  return createTenantContext({
    tenantId,
    principalId: "trust-sandbox-client",
    requestId: "request.trust-preview.001",
    roles: ["client"],
    permissions: [
      "trust:verification:read",
      "trust:governance:preview",
      "trust:evidence:read",
      "trust:audit:read",
    ],
    createdAt: NOW,
  });
}

function verification(tenantId = "component.tenant.trust-preview") {
  return Object.freeze({
    verificationId: "trust-verification-sandbox-001",
    tenantId,
    productId: "product:trust",
    environment: "sandbox",
    mode: "mock",
    status: "accepted",
    subjectRef: "subject:customer-001",
    modality: "face+liveness",
    adapter: "none",
    biometricProcessing: false,
    result: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

test("Trust governance preview produces governed decision/evidence/audit without execution", async () => {
  const result = await runTrustGovernancePreview({
    verification: verification(),
    tenantContext: tenantContext(),
    clock: () => NOW,
    idFactory: ids(),
  });

  assert.equal(result.tenantId, "component.tenant.trust-preview");
  assert.equal(result.verificationId, "trust-verification-sandbox-001");
  assert.equal(result.environment, "sandbox");
  assert.equal(result.mode, "preview");
  assert.equal(result.realBiometrics, false);
  assert.equal(result.executionObserved, false);
  assert.equal(result.mutationObserved, false);

  assert.equal(result.decisionReport.mode, "advisory");
  assert.equal(result.decisionReport.decisionState, "ready-for-human-decision");
  assert.equal(result.decisionReport.approved, false);
  assert.equal(result.decisionReport.humanApprovalRequired, true);
  assert.equal(result.decisionReport.executionAllowed, false);
  assert.equal(result.decisionReport.mutationAllowed, false);

  assert.equal(result.policyDecision.dryRun, true);
  assert.equal(result.policyDecision.effect, "allow");
  assert.equal(result.policyDecision.executionAllowed, false);
  assert.equal(result.policyDecision.mutationAllowed, false);

  assert.equal(result.runtimeReport.requestedMode, "preview");
  assert.equal(result.runtimeReport.state, "previewed");
  assert.equal(result.runtimeReport.executionObserved, false);
  assert.equal(result.runtimeReport.mutationObserved, false);

  assert.equal(result.evidenceRecord.metadata.immutable, true);
  assert.equal(result.evidenceRecord.metadata.redacted, true);
  assert.equal(result.evidenceRecord.integrity.algorithm, "sha256");
  assert.match(result.evidenceRecord.integrity.digest, /^[a-f0-9]{64}$/);
  assert.equal(verifyEvidence(result.evidenceRecord), true);

  assert.equal(result.auditReport.mode, "advisory");
  assert.equal(result.auditReport.status, "compliant");
  assert.equal(result.auditReport.evidenceVerified, true);
  assert.equal(result.auditReport.mutationAllowed, false);
  assert.equal(result.auditReport.executionAllowed, false);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("data:image"), false);
  assert.equal(serialized.includes("biometricTemplate"), false);
  assert.equal(serialized.includes("provider-real"), false);
});

test("Trust governance preview rejects cross-tenant verification before lifecycle execution", async () => {
  await assert.rejects(
    runTrustGovernancePreview({
      verification: verification("component.tenant.other"),
      tenantContext: tenantContext(),
      clock: () => NOW,
      idFactory: ids(),
    }),
    /cross_tenant_verification_blocked/,
  );
});

test("Trust governance preview rejects real adapters and biometric processing", async () => {
  await assert.rejects(
    runTrustGovernancePreview({
      verification: { ...verification(), adapter: "provider-real" },
      tenantContext: tenantContext(),
      clock: () => NOW,
      idFactory: ids(),
    }),
    /real_adapter_blocked/,
  );

  await assert.rejects(
    runTrustGovernancePreview({
      verification: { ...verification(), biometricProcessing: true },
      tenantContext: tenantContext(),
      clock: () => NOW,
      idFactory: ids(),
    }),
    /biometric_processing_blocked/,
  );
});
