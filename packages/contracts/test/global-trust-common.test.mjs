import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  assertGlobalTrustCommonContract,
  createAuditEvent,
  createAuthenticationContext,
  createAuthorizationDecision,
  createCredentialMetadata,
  createEvidenceRecord,
  createIdentitySubject,
  createLocaleContext,
  createModelDescriptor,
  createRiskAssessment,
  createSafetyDecision,
  createTenantContext,
  createToolInvocationPolicy,
  globalTrustCommonContractTypes,
  globalTrustCommonContractVersion,
} from "../src/global-trust-common.mjs";

const now = "2026-07-27T12:00:00.000Z";
const later = "2026-07-27T13:00:00.000Z";
const tenantId = "tenant.uni";
const subjectId = "subject.igor";
const digest = "a".repeat(64);

function validContracts() {
  return [
    createIdentitySubject({ subjectId, tenantId, subjectType: "person", displayName: "Igor" }),
    createTenantContext({ tenantId, region: "BR-SC", scopes: ["runtime:read"] }),
    createAuthenticationContext({
      authenticationId: "auth.001",
      subjectId,
      tenantId,
      methods: ["passkey", "mfa"],
      assuranceLevel: "aal2",
      authenticatedAt: now,
      expiresAt: later,
    }),
    createAuthorizationDecision({
      decisionId: "decision.001",
      subjectId,
      tenantId,
      action: "runtime.read",
      resource: "uni-co-runtime",
      effect: "allow",
      policyVersion: "policy.1.0.0",
      reasonCodes: ["scope_match"],
      decidedAt: now,
    }),
    createCredentialMetadata({
      credentialId: "credential.001",
      subjectId,
      tenantId,
      credentialType: "passkey",
      issuedAt: now,
      expiresAt: later,
    }),
    createRiskAssessment({
      assessmentId: "risk.001",
      subjectId,
      tenantId,
      useCase: "assistant.tool.read",
      score: 20,
      factors: ["read_only"],
      methodVersion: "risk.1.0.0",
      assessedAt: now,
    }),
    createModelDescriptor({
      modelId: "model.001",
      tenantId,
      provider: "provider",
      model: "model-name",
      version: "2026-07",
      purpose: "multilingual-assistance",
      dataPolicyId: "policy.data.001",
      allowedLocales: ["en", "pt-BR"],
    }),
    createToolInvocationPolicy({
      policyId: "tool-policy.001",
      tenantId,
      toolId: "github.read",
      allowedActions: ["repository.read"],
      deniedActions: ["repository.write"],
      maxCallsPerRequest: 3,
      humanApprovalRequired: true,
    }),
    createSafetyDecision({
      safetyDecisionId: "safety.001",
      assessmentId: "risk.001",
      tenantId,
      outcome: "pending_approval",
      controls: ["human_review"],
      reasonCodes: ["privileged_boundary"],
      decidedAt: now,
    }),
    createAuditEvent({
      eventId: "audit.001",
      tenantId,
      actorId: subjectId,
      action: "runtime.read",
      resource: "uni-co-runtime",
      outcome: "success",
      correlationId: "correlation.001",
      metadata: { locale: "pt-BR" },
      occurredAt: now,
    }),
    createEvidenceRecord({
      evidenceId: "evidence.001",
      tenantId,
      kind: "test",
      source: "contracts-ci",
      digest,
      capturedAt: now,
    }),
    createLocaleContext({
      tenantId,
      locale: "pt-BR",
      fallbackLocale: "en",
      timeZone: "America/Sao_Paulo",
      currency: "BRL",
      legalRegion: "BR",
    }),
  ];
}

test("Gate 1 exposes the 12 versioned common contracts", () => {
  assert.equal(globalTrustCommonContractVersion, "1.0.0");
  assert.equal(globalTrustCommonContractTypes.length, 12);
  assert.deepEqual(validContracts().map((item) => item.contractType), globalTrustCommonContractTypes);
});

test("all common contracts validate and are deeply frozen", () => {
  for (const contract of validContracts()) {
    assert.equal(assertGlobalTrustCommonContract(contract), contract);
    assert.equal(Object.isFrozen(contract), true);
    for (const child of Object.values(contract)) {
      if (child && typeof child === "object") assert.equal(Object.isFrozen(child), true);
    }
  }
});

test("credentials, audit and evidence fail closed on sensitive material", () => {
  const [,,,, credential,,,,, audit, evidence] = validContracts();

  assert.throws(
    () => assertGlobalTrustCommonContract({ ...credential, secretMaterialIncluded: true }),
    /secretMaterialIncluded must be false/,
  );
  assert.throws(
    () => assertGlobalTrustCommonContract({ ...audit, sensitiveContentIncluded: true }),
    /sensitiveContentIncluded must be false/,
  );
  assert.throws(
    () => assertGlobalTrustCommonContract({ ...evidence, sensitiveContentIncluded: true }),
    /sensitiveContentIncluded must be false/,
  );
});

test("tenant and tool policies block cross-tenant and administrative execution", () => {
  const tenant = createTenantContext({ tenantId, region: "BR-SC" });
  const tool = createToolInvocationPolicy({
    policyId: "tool-policy.002",
    tenantId,
    toolId: "github.read",
  });

  assert.throws(
    () => assertGlobalTrustCommonContract({ ...tenant, crossTenantAccessAllowed: true }),
    /crossTenantAccessAllowed must be false/,
  );
  assert.throws(
    () => assertGlobalTrustCommonContract({ ...tool, administrativeExecutionAllowed: true }),
    /administrativeExecutionAllowed must be false/,
  );
});

test("pending approval decisions require human approval", () => {
  assert.throws(
    () => createAuthorizationDecision({
      decisionId: "decision.002",
      subjectId,
      tenantId,
      action: "deploy",
      resource: "production",
      effect: "pending_approval",
      policyVersion: "policy.1.0.0",
      reasonCodes: ["sensitive_action"],
      humanApprovalRequired: false,
    }),
    /humanApprovalRequired must be true/,
  );
});

test("risk level is deterministic from score", () => {
  const contract = createRiskAssessment({
    assessmentId: "risk.002",
    subjectId,
    tenantId,
    useCase: "assistant.tool.write",
    score: 76,
    methodVersion: "risk.1.0.0",
  });
  assert.equal(contract.level, "critical");
  assert.throws(
    () => assertGlobalTrustCommonContract({ ...contract, level: "low" }),
    /inconsistent with score/,
  );
});

test("Arabic locale requires right-to-left direction", () => {
  const locale = createLocaleContext({
    tenantId,
    locale: "ar",
    timeZone: "Asia/Riyadh",
    currency: "SAR",
    legalRegion: "SA",
  });
  assert.equal(locale.direction, "rtl");
  assert.throws(
    () => assertGlobalTrustCommonContract({ ...locale, direction: "ltr" }),
    /must be rtl for Arabic/,
  );
});

test("metadata rejects likely secret-bearing keys", () => {
  assert.throws(
    () => createAuditEvent({
      eventId: "audit.002",
      tenantId,
      actorId: subjectId,
      action: "test",
      resource: "contract",
      outcome: "success",
      correlationId: "correlation.002",
      metadata: { accessToken: "not-allowed" },
    }),
    /forbidden sensitive key/,
  );
});


test("Portuguese and English examples cover and validate all 12 contracts", async () => {
  for (const file of ["global-trust.pt-BR.json", "global-trust.en.json"]) {
    const document = JSON.parse(
      await readFile(new URL(`../examples/${file}`, import.meta.url), "utf8"),
    );
    assert.equal(document.schemaVersion, "1.0.0");
    assert.equal(document.contracts.length, 12);
    assert.deepEqual(
      document.contracts.map((contract) => contract.contractType),
      globalTrustCommonContractTypes,
    );
    for (const contract of document.contracts) {
      assert.equal(assertGlobalTrustCommonContract(contract), contract);
    }
  }
});
