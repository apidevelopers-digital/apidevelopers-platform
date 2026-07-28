import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createOperationalGateway } from "../src/operational-composition.mjs";
import { listDurableGlobalTrustDecisionEvidence } from "../src/durable-global-trust-decision-evidence.mjs";

function auditRequest(apiKey, url, correlationId) {
  return {
    method: "GET",
    url,
    headers: {
      "x-api-key": apiKey,
      "x-correlation-id": correlationId,
    },
  };
}

test("persists allowed audit-query decision evidence with correlated event ids", async () => {
  const directory = await mkdtemp(join(tmpdir(), "decision-evidence-http-"));
  try {
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
      authorizationIdFactory: () => "decision_001",
      riskNow: () => "2026-07-28T12:00:02.000Z",
      riskAssessmentIdFactory: () => "assessment_001",
      safetyDecisionIdFactory: () => "safety_001",
      decisionEvidenceNow: () => "2026-07-28T12:00:03.000Z",
      decisionEvidenceIdFactory: () => "evidence_001",
    });

    await gateway.app.handleRequest(auditRequest("admin-secret", "/v1/whoami", "source_corr"));

    const response = await gateway.app.handleRequest(
      auditRequest(
        "admin-secret",
        "/v1/audit-events?correlationId=source_corr&limit=10",
        "query_corr",
      ),
    );

    assert.equal(response.status, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.correlationId, "query_corr");
    assert.equal(body.decisionEvidence.evidenceId, "evidence_001");
    assert.equal(body.decisionEvidence.outcome, "allowed");
    assert.deepEqual(body.decisionEvidence.eventIds, ["event_001"]);
    assert.equal(body.decisionEvidence.sensitiveContentIncluded, false);

    const evidence = await listDurableGlobalTrustDecisionEvidence(gateway.store);
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].authorizationDecisionId, "decision_001");
    assert.equal(evidence[0].riskAssessmentId, "assessment_001");
    assert.equal(evidence[0].safetyDecisionId, "safety_001");
    assert.equal(JSON.stringify(evidence).includes("admin-secret"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("persists denied authorization evidence without evaluating risk", async () => {
  const directory = await mkdtemp(join(tmpdir(), "decision-evidence-http-"));
  try {
    const gateway = createOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "admin-secret",
      adminPrincipal: {
        id: "actor_002",
        tenantId: "tenant_002",
        kind: "human",
        scopes: [],
      },
      authorizationNow: () => "2026-07-28T12:00:00.000Z",
      authorizationIdFactory: () => "decision_denied",
      decisionEvidenceNow: () => "2026-07-28T12:00:01.000Z",
      decisionEvidenceIdFactory: () => "evidence_denied",
    });

    const response = await gateway.app.handleRequest(
      auditRequest("admin-secret", "/v1/audit-events?limit=10", "deny_corr"),
     );

    assert.equal(response.status, 403);
    const body = JSON.parse(response.body);
    assert.equal(body.authorizationDecision.effect, "deny");
    assert.equal(body.decisionEvidence.outcome, "authorization_denied");
    assert.equal("riskAssessmentId" in body.decisionEvidence, false);
    assert.equal("safetyDecisionId" in body.decisionEvidence, false);

    const evidence = await listDurableGlobalTrustDecisionEvidence(gateway.store);
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].evidenceId, "evidence_denied");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("persists pending human-approval evidence for high-risk service query", async () => {
  const directory = await mkdtemp(join(tmpdir(), "decision-evidence-http-"));
  try {
    const gateway = createOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "service-secret",
      adminPrincipal: {
        id: "service_001",
        tenantId: "tenant_003",
        kind: "service",
        scopes: ["audit:read"],
      },
      authorizationNow: () => "2026-07-28T12:00:00.000Z",
      authorizationIdFactory: () => "decision_pending",
      riskNow: () => "2026-07-28T12:00:01.000Z",
      riskAssessmentIdFactory: () => "assessment_pending",
      safetyDecisionIdFactory: () => "safety_pending",
      decisionEvidenceNow: () => "2026-07-28T12:00:02.000Z",
      decisionEvidenceIdFactory: () => "evidence_pending",
    });

    const response = await gateway.app.handleRequest(
      auditRequest("service-secret", "/v1/audit-events?limit=150", "pending_corr"),
    );

    assert.equal(response.status, 202);
    const body = JSON.parse(response.body);
    assert.equal(body.riskAssessment.level, "high");
    assert.equal(body.safetyDecision.outcome, "pending_approval");
    assert.equal(body.decisionEvidence.outcome, "human_approval_required");

    const evidence = await listDurableGlobalTrustDecisionEvidence(gateway.store);
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].riskAssessmentId, "assessment_pending");
    assert.equal(evidence[0].safetyDecisionId, "safety_pending");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
