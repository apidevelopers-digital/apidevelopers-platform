import { randomUUID } from "node:crypto";

const AUTHORIZATION_COLLECTION = "global_trust_authorization_decisions";
const RISK_COLLECTION = "global_trust_risk_assessments";
const SAFETY_COLLECTION = "global_trust_safety_decisions";
const EVIDENCE_COLLECTION = "global_trust_decision_evidence";

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function assertContract(value, contractType, idField, name) {
  if (!value || typeof value !== "object") throw new TypeError(`${name} is required`);
  if (value.contractType !== contractType) {
    throw new TypeError(`${name}.contractType must be ${contractType}`);
  }
  requireText(value[idField], `${name}.${idField}`);
  requireText(value.tenantId, `${name}.tenantId`);
  return value;
}

function uniqueTextList(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value ?? "").trim().filter(Boolean))].sort();
}

export function createDurableGlobalTrustDecisionEvidence({
  store,
  idFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction must be a function");
  }
  if (typeof idFactory !== "function") throw new TypeError("idFactory must be a function");
  if (typeof now !== "function") throw new TypeError("now must be a function");

  return Object.freeze({
    createCorrelationId() {
      return requireText(idFactory(), "correlationId");
    },

    async persistDecisionEvidence({
      correlationId,
      route = "/v1/audit-events",
      outcome,
      authorizationDecision,
      riskAssessment,
      safetyDecision,
      eventIds = [],
    } = {}) {
      const authorization = assertContract(
        authorizationDecision,
        "AuthorizationDecision",
        "decisionId",
        "authorizationDecision",
      );
      const risk = riskAssessment
        ? assertContract(riskAssessment, "RiskAssessment", "assessmentId", "riskAssessment")
        : undefined;
      const safety = safetyDecision
        ? assertContract(safetyDecision, "SafetyDecision", "safetyDecisionId", "safetyDecision")
        : undefined;

      if (risk && risk.tenantId !== authorization.tenantId) {
        throw new TypeError("riskAssessment tenantId must match authorizationDecision tenantId");
      }
      if (safety && safety.tenantId !== authorization.tenantId) {
        throw new TypeError("safetyDecision tenantId must match authorizationDecision tenantId");
      }
      if (risk && safety && safety.assessmentId !== risk.assessmentId) {
        throw new TypeError("safetyDecision assessmentId must match riskAssessment assessmentId");
      }

      const evidence = Object.freeze({
        contractType: "DecisionEvidence",
        contractVersion: "1.0",
        evidenceId: requireText(idFactory(), "evidenceId"),
        tenantId: authorization.tenantId,
        correlationId: requireText(correlationId, "correlationId"),
        route: requireText(route, "route"),
        action: requireText(authorization.action, "authorizationDecision.action"),
        resource: requireText(authorization.resource, "authorizationDecision.resource"),
        outcome: requireText(outcome, "outcome"),
        authorizationDecisionId: authorization.decisionId,
        ...(risk ? { riskAssessmentId: risk.assessmentId } : {}),
        ...(safety ? { safetyDecisionId: safety.safetyDecisionId } : {}),
        eventIds: Object.freeze(uniqueTextList(eventIds)),
        recordedAt: requireText(now(), "recordedAt"),
        sensitiveContentIncluded: false,
      });

      const result = await store.transaction((tx) => {
        tx.put(
          AUTHORIZATION_COLLECTION,
          authorization.decisionId,
          authorization,
          { ifAbsent: true },
        );
        if (risk) {
          tx.put(RISK_COLLECTION, risk.assessmentId, risk, { ifAbsent: true });
        }
        if (safety) {
          tx.put(SAFETY_COLLECTION, safety.safetyDecisionId, safety, { ifAbsent: true });
        }
        tx.put(EVIDENCE_COLLECTION, evidence.evidenceId, evidence, { ifAbsent: true });
        return evidence;
      });
      return result.result;
    },
  });
}

export async function listDurableGlobalTrustDecisionEvidence(store) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction must be a function");
  }
  const result = await store.transaction((tx) => tx.list(EVIDENCE_COLLECTION));
  return result.result.map(({ value }) => value);
}
