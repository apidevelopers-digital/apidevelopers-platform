import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";

import {
  createDurableGlobalTrustDecisionEvidence,
  listDurableGlobalTrustDecisionEvidence,
} from "../src/durable-global-trust-decision-evidence.mjs";
import { createGatewayAuthorizationService } from "../src/global-trust-authorization.mjs";
import { createGatewayRiskService } from "../src/global-trust-risk.mjs";

test("persists authorization, risk, safety and correlated evidence atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "decision-evidence-"));
  try {
    const store = createJsonFileStore({ filePath: join(directory, "state.json") });
    const authorization = createGatewayAuthorizationService({
      idFactory: () => "decision_001",
      now: () => "2026-07-28T12:00:00.000Z",
    }).decide({
      identity: {
        principal: {
          id: "actor_001",
          tenantId: "tenant_001",
          scopes: ["audit:read"],
        },
      },
      action: "audit.events.read",
      resource: "tenant:tenant_001:audit-events",
      requiredScopes: ["audit:read"],
    });
    const { assessment, safetyDecision } = createGatewayRiskService({
      assessmentIdFactory: () => "assessment_001",
      safetyDecisionIdFactory: () => "safety_001",
      now: () => "2026-07-28T12:00:01.000Z",
    }).assessAuditQuery({
      identity: {
        principal: {
          id: "actor_001",
          tenantId: "tenant_001",
          kind: "human",
        },
      },
      query: { correlationId: "source_corr", limit: "50" },
    });
    const service = createDurableGlobalTrustDecisionEvidence({
      store,
      idFactory: () => "evidence_001",
      now: () => "2026-07-28T12:00:02.000Z",
    });

    const evidence = await service.persistDecisionEvidence({
      correlationId: "query_corr",
      outcome: "allowed",
      authorizationDecision: authorization,
      riskAssessment: assessment,
      safetyDecision,
      eventIds: ["event_002", "event_001", "event_002"],
    });

    assert.equal(evidence.contractType, "DecisionEvidence");
    assert.equal(evidence.tenantId, "tenant_001");
    assert.deepEqual(evidence.eventIds, ["event_001", "event_002"]);
    assert.equal(evidence.sensitiveContentIncluded, false);

    const stored = await store.transaction((tx) => ({
      authorization: tx.get("global_trust_authorization_decisions", "decision_001"),
      risk: tx.get("global_trust_risk_assessments", "assessment_001"),
      safety: tx.get("global_trust_safety_decisions", "safety_001"),
      evidence: tx.get("global_trust_decision_evidence", "evidence_001"),
    }));

    assert.equal(stored.result.authorization.effect, "allow");
    assert.equal(stored.result.risk.level, "low");
    assert.equal(stored.result.safety.outcome, "allow");
    assert.equal(stored.result.evidence.correlationId, "query_corr");

    const evidenceRecords = await listDurableGlobalTrustDecisionEvidence(store);
    assert.equal(evidenceRecords.length, 1);
    assert.equal(JSON.stringify(evidenceRecords).includes("secret"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects cross-tenant decision evidence before persistence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "decision-evidence-"));
  try {
    const store = createJsonFileStore({ filePath: join(directory, "state.json") });
    const service = createDurableGlobalTrustDecisionEvidence({
      store,
      idFactory: () => "evidence_cross_tenant",
      now: () => "2026-07-28T12:00:00.000Z",
    });

    const authorizationDecision = Object.freeze({
      contractType: "AuthorizationDecision",
      contractVersion: "1.0",
      decisionId: "decision_cross_tenant",
      subjectId: "actor_001",
      tenantId: "tenant_001",
      action: "audit.events.read",
      resource: "tenant:tenant_001:audit-events",
      effect: "allow",
      policyVersion: "gateway-authz-v1",
      reasonCodes: Object.freeze(["required_scopes_satisfied"]),
      humanApprovalRequired: false,
      decidedAt: "2026-07-28T12:00:00.000Z",
    });
    const riskAssessment = Object.freeze({
      contractType: "RiskAssessment",
      contractVersion: "1.0",
      assessmentId: "assessment_cross_tenant",
      subjectId: "actor_002",
      tenantId: "tenant_002",
      useCase: "gateway.audit.events.read",
      score: 5,
      level: "low",
      factors: Object.freeze(["standard_tenant_audit_read"]),
      methodVersion: "gateway-risk-v1",
      assessedAt: "2026-07-28T12:00:00.000Z",
    });

    await assert.rejects(
      service.persistDecisionEvidence({
        correlationId: "query_corr",
        outcome: "allowed",
        authorizationDecision,
        riskAssessment,
      }),
      /tenantId must match/,
    );

    assert.deepEqual(await listDurableGlobalTrustDecisionEvidence(store), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
