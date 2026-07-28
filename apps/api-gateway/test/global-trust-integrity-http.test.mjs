import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOperationalGateway } from "../src/operational-composition.mjs";

function request(apiKey, url, correlationId) {
  return {
    method: "GET",
    url,
    headers: {
      "x-api-key": apiKey,
      ...(correlationId ? { "x-correlation-id": correlationId } : {}),
    },
  };
}

test("verifies protected operational records and returns 409 after tampering", async () => {
  const directory = await mkdtemp(join(tmpdir(), "global-trust-integrity-http-"));
  try {
    const authorizationIds = [
      "decision_query",
      "decision_integrity_valid",
      "decision_integrity_tampered",
    ];
    const integrityIds = [
      "proof_audit",
      "proof_authorization",
      "proof_risk",
      "proof_safety",
      "proof_evidence",
    ];
    const gateway = createOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "admin-secret",
      adminPrincipal: {
        id: "actor_001",
        tenantId: "tenant_001",
        kind: "human",
        scopes: ["audit:read"],
      },
      auditNow: () => "2026-07-28T12:00:00.000Z",
      auditIdFactory: () => "event_001",
      authorizationNow: () => "2026-07-28T12:00:01.000Z",
      authorizationIdFactory: () => authorizationIds.shift(),
      riskNow: () => "2026-07-28T12:00:02.000Z",
      riskAssessmentIdFactory: () => "assessment_001",
      safetyDecisionIdFactory: () => "safety_001",
      decisionEvidenceNow: () => "2026-07-28T12:00:03.000Z",
      decisionEvidenceIdFactory: () => "evidence_001",
      integrityNow: () => "2026-07-28T12:00:04.000Z",
      integrityIdFactory: () => integrityIds.shift(),
    });

    const whoami = await gateway.app.handleRequest(
      request("admin-secret", "/v1/whoami", "source_corr"),
    );
    assert.equal(whoami.status, 200);

    const query = await gateway.app.handleRequest(
      request(
        "admin-secret",
        "/v1/audit-events?correlationId=source_corr&limit=10",
        "query_corr",
      ),
    );
    assert.equal(query.status, 200);

    const validResponse = await gateway.app.handleRequest(
      request("admin-secret", "/v1/global-trust/integrity"),
    );
    assert.equal(validResponse.status, 200);
    const validBody = JSON.parse(validResponse.body);
    assert.equal(validBody.tenantId, "tenant_001");
    assert.equal(validBody.authorizationDecision.effect, "allow");
    assert.equal(validBody.verification.valid, true);
    assert.equal(validBody.verification.proofCount, 5);
    assert.equal(validBody.verification.protectedRecordCount, 5);
    assert.equal(validBody.verification.verifiedRecordCount, 5);
    assert.deepEqual(validBody.verification.failures, []);
    assert.equal(validBody.verification.sensitiveContentIncluded, false);
    assert.equal(JSON.stringify(validBody).includes("admin-secret"), false);

    const eventRead = await gateway.store.transaction((tx) =>
      tx.get("global_trust_audit_events", "event_001"),
    );
    await gateway.store.transaction((tx) => {
      tx.put("global_trust_audit_events", "event_001", {
        ...eventRead.result,
        outcome: "failure",
      });
    });

    const tamperedResponse = await gateway.app.handleRequest(
      request("admin-secret", "/v1/global-trust/integrity"),
    );
    assert.equal(tamperedResponse.status, 409);
    const tamperedBody = JSON.parse(tamperedResponse.body);
    assert.equal(tamperedBody.error, "integrity_verification_failed");
    assert.equal(tamperedBody.verification.valid, false);
    assert.equal(
      tamperedBody.verification.failures.some(
        (failure) => failure.code === "payload_hash_mismatch",
      ),
      true,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps integrity verification tenant-isolated and denies missing audit scope", async () => {
  const directory = await mkdtemp(join(tmpdir(), "global-trust-integrity-isolation-"));
  const stateFilePath = join(directory, "state.json");
  try {
    const tenantA = createOperationalGateway({
      stateFilePath,
      adminKey: "tenant-a-secret",
      adminPrincipal: {
        id: "actor_a",
        tenantId: "tenant_a",
        kind: "human",
        scopes: ["audit:read"],
      },
      auditIdFactory: () => "event_a",
      integrityIdFactory: () => "proof_a",
      authorizationIdFactory: () => "decision_a",
    });
    const issued = await tenantA.app.handleRequest(
      request("tenant-a-secret", "/v1/whoami", "corr_a"),
    );
    assert.equal(issued.status, 200);

    const tenantB = createOperationalGateway({
      stateFilePath,
      adminKey: "tenant-b-secret",
      adminPrincipal: {
        id: "actor_b",
        tenantId: "tenant_b",
        kind: "human",
        scopes: ["audit:read"],
      },
      authorizationIdFactory: () => "decision_b",
    });
    const isolated = await tenantB.app.handleRequest(
      request("tenant-b-secret", "/v1/global-trust/integrity"),
    );
    assert.equal(isolated.status, 200);
    const isolatedBody = JSON.parse(isolated.body);
    assert.equal(isolatedBody.verification.valid, true);
    assert.equal(isolatedBody.verification.proofCount, 0);
    assert.equal(isolatedBody.verification.protectedRecordCount, 0);
    assert.equal(JSON.stringify(isolatedBody).includes("tenant_a"), false);

    const deniedGateway = createOperationalGateway({
      stateFilePath,
      adminKey: "denied-secret",
      adminPrincipal: {
        id: "actor_denied",
        tenantId: "tenant_denied",
        kind: "human",
        scopes: [],
      },
      authorizationIdFactory: () => "decision_denied",
    });
    const denied = await deniedGateway.app.handleRequest(
      request("denied-secret", "/v1/global-trust/integrity"),
    );
    assert.equal(denied.status, 403);
    const deniedBody = JSON.parse(denied.body);
    assert.equal(deniedBody.error, "forbidden");
    assert.equal(deniedBody.authorizationDecision.effect, "deny");
    assert.deepEqual(deniedBody.authorizationDecision.reasonCodes, [
      "missing_scope:audit:read",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
