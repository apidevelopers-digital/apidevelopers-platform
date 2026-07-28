const COLLECTIONS = Object.freeze({
  auditEvents: "global_trust_audit_events",
  authorizationDecisions: "global_trust_authorization_decisions",
  riskAssessments: "global_trust_risk_assessments",
  safetyDecisions: "global_trust_safety_decisions",
  decisionEvidence: "global_trust_decision_evidence",
});

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function tenantValues(records, tenantId) {
  return records
    .map(({ value }) => value)
    .filter((value) => value?.tenantId === tenantId);
}

function countBy(values, field, knownKeys = []) {
  const counts = Object.fromEntries(knownKeys.map((key) => [key, 0]));
  counts.other = 0;

  for (const value of values) {
    const key = String(value?.[field] ?? "");
    if (Object.hasOwn(counts, key) && key !== "other") counts[key] += 1;
    else counts.other += 1;
  }

  return Object.freeze({
    total: values.length,
    ...counts,
  });
}

export function createGlobalTrustObservabilityService({
  store,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction must be a function");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function");

  return Object.freeze({
    async snapshotTenant({ tenantId } = {}) {
      const requiredTenantId = requireText(tenantId, "tenantId");
      const result = await store.transaction((tx) => ({
        auditEvents: tx.list(COLLECTIONS.auditEvents),
        authorizationDecisions: tx.list(COLLECTIONS.authorizationDecisions),
        riskAssessments: tx.list(COLLECTIONS.riskAssessments),
        safetyDecisions: tx.list(COLLECTIONS.safetyDecisions),
        decisionEvidence: tx.list(COLLECTIONS.decisionEvidence),
      }));

      const auditEvents = tenantValues(result.result.auditEvents, requiredTenantId);
      const authorizationDecisions = tenantValues(
        result.result.authorizationDecisions,
        requiredTenantId,
      );
      const riskAssessments = tenantValues(result.result.riskAssessments, requiredTenantId);
      const safetyDecisions = tenantValues(result.result.safetyDecisions, requiredTenantId);
      const decisionEvidence = tenantValues(result.result.decisionEvidence, requiredTenantId);

      return Object.freeze({
        contractType: "GlobalTrustObservabilitySnapshot",
        contractVersion: "1.0",
        tenantId: requiredTenantId,
        generatedAt: requireText(now(), "generatedAt"),
        auditEvents: Object.freeze({
          total: auditEvents.length,
          sensitiveContentIncluded: auditEvents.some(
            (event) => event.sensitiveContentIncluded === true,
          ),
        }),
        authorization: countBy(authorizationDecisions, "effect", ["allow", "deny"]),
        risk: countBy(riskAssessments, "level", ["low", "medium", "high", "critical"]),
        safety: countBy(safetyDecisions, "outcome", [
          "allow",
          "pending_approval",
          "deny",
        ]),
        evidence: countBy(decisionEvidence, "outcome", [
          "allowed",
          "authorization_denied",
          "risk_blocked",
          "human_approval_required",
          "invalid_query",
        ]),
        sensitiveContentIncluded: false,
      });
    },
  });
}
