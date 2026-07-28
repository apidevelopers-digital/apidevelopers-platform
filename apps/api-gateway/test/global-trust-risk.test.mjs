import assert from "node:assert/strict";
import test from "node:test";

import { createGatewayRiskService } from "../src/global-trust-risk.mjs";

test("allows a narrowed tenant audit query with contractual evidence", () => {
  const ids = ["assessment_001", "safety_001"];
  const service = createGatewayRiskService({
    assessmentIdFactory: () => ids.shift(),
    safetyDecisionIdFactory: () => ids.shift(),
    now: () => "2026-07-28T12:00:00.000Z",
  });

  const result = service.assessAuditQuery({
    identity: { principal: { id: "actor_001", tenantId: "tenant_001", kind: "human" } },
    query: { correlationId: "corr_001", limit: "50" },
  });

  assert.equal(result.assessment.contractType, "RiskAssessment");
  assert.equal(result.assessment.level, "low");
  assert.equal(result.safetyDecision.contractType, "SafetyDecision");
  assert.equal(result.safetyDecision.outcome, "allow");
  assert.deepEqual(result.safetyDecision.controls, [
    "tenant_isolation",
    "scope_audit_read",
    "bounded_limit",
  ]);
});

test("requires human approval for a high-risk broad service query", () => {
  const ids = ["assessment_002", "safety_002"];
  const service = createGatewayRiskService({
    assessmentIdFactory: () => ids.shift(),
    safetyDecisionIdFactory: () => ids.shift(),
    now: () => "2026-07-28T12:00:00.000Z",
  });

  const result = service.assessAuditQuery({
    identity: { principal: { id: "service_001", tenantId: "tenant_001", kind: "service" } },
    query: { limit: "150" },
  });

  assert.equal(result.assessment.score, 55);
  assert.equal(result.assessment.level, "high");
  assert.equal(result.safetyDecision.outcome, "pending_approval");
  assert.equal(result.safetyDecision.controls.includes("human_approval"), true);
});
