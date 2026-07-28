import { createRiskAssessment, createSafetyDecision } from "@apidevelopers/contracts";
import { randomUUID } from "node:crypto";

export function createGatewayRiskService({
  methodVersion = "gateway-risk-v1",
  assessmentIdFactory = randomUUID,
  safetyDecisionIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  return Object.freeze({
    assessAuditQuery({ identity, query = {} } = {}) {
      const principal = identity?.principal ?? {};
      const factors = [];
      let score = 5;

      const limit = Number(query.limit ?? 50);
      if (limit > 100) {
        score += 25;
        factors.push("large_result_window");
      }
      const hasNarrowingFilter = ["correlationId", "action", "actorId", "from", "to"]
        .some((key) => Boolean(query[key]));
      if (!hasNarrowingFilter) {
        score += 15;
        factors.push("unfiltered_audit_query");
      }
      if (principal.kind === "service") {
        score += 10;
        factors.push("service_principal");
      }
      if (factors.length === 0) factors.push("standard_tenant_audit_read");

      const assessment = createRiskAssessment({
        assessmentId: assessmentIdFactory(),
        subjectId: principal.id,
        tenantId: principal.tenantId,
        useCase: "gateway.audit.events.read",
        score,
        factors,
        methodVersion,
        assessedAt: now(),
      });

      const outcome = assessment.level === "critical"
        ? "deny"
        : assessment.level === "high"
          ? "pending_approval"
          : "allow";

      const safetyDecision = createSafetyDecision({
        safetyDecisionId: safetyDecisionIdFactory(),
        assessmentId: assessment.assessmentId,
        tenantId: assessment.tenantId,
        outcome,
        controls: outcome === "allow"
          ? ["tenant_isolation", "scope_audit_read", "bounded_limit"]
          : outcome === "pending_approval"
            ? ["human_approval", "tenant_isolation", "bounded_limit"]
            : ["request_blocked"],
        reasonCodes: [`risk_level:${assessment.level}`],
        decidedAt: now(),
      });

      return Object.freeze({ assessment, safetyDecision });
    },
  });
}
