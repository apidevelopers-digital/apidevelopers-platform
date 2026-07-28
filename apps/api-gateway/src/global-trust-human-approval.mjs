import { randomUUID } from "node:crypto";

import { sha256Canonical } from "./canonical-hash.mjs";
import { createGlobalTrustIntegrityService } from "./global-trust-integrity.mjs";

export const HUMAN_APPROVAL_REQUEST_COLLECTION = "global_trust_human_approval_requests";
export const HUMAN_APPROVAL_RESOLUTION_COLLECTION = "global_trust_human_approval_resolutions";
export const HUMAN_APPROVAL_CONSUMPTION_COLLECTION = "global_trust_human_approval_consumptions";

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function instant(value, name) {
  const normalized = required(value, name);
  if (!Number.isFinite(Date.parse(normalized))) throw new TypeError(`${name} must be an ISO date`);
  return normalized;
}

function normalizedQuery(query = {}) {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError("query.limit must be an integer between 1 and 500");
  }

  return Object.freeze({
    correlationId: query.correlationId ? String(query.correlationId).trim() : null,
    action: query.action ? String(query.action).trim() : null,
    actorId: query.actorId ? String(query.actorId).trim() : null,
    from: query.from ? String(query.from).trim() : null,
    to: query.to ? String(query.to).trim() : null,
    limit,
  });
}

function queryHash(query) {
  return sha256Canonical(normalizedQuery(query));
}

function valuesForTenant(tx, collection, tenantId) {
  return tx.list(collection)
    .map(({ value }) => value)
    .filter((value) => value?.tenantId === tenantId);
}

function stateFor(tx, tenantId, request, currentIso) {
  const resolution = valuesForTenant(tx, HUMAN_APPROVAL_RESOLUTION_COLLECTION, tenantId)
    .find((item) => item.approvalRequestId === request.approvalRequestId);
  const consumption = valuesForTenant(tx, HUMAN_APPROVAL_CONSUMPTION_COLLECTION, tenantId)
    .find((item) => item.approvalRequestId === request.approvalRequestId);

  const currentTime = Date.parse(required(currentIso, "currentIso"));
  const expired = Date.parse(request.expiresAt) <= currentTime;
  const status = consumption
    ? "consumed"
    : expired
      ? "expired"
      : resolution
        ? resolution.decision
        : "pending";

  return Object.freeze({ request, resolution, consumption, status });
}

function publicState(state) {
  const { request, resolution, consumption, status } = state;
  return Object.freeze({
    approvalRequestId: request.approvalRequestId,
    tenantId: request.tenantId,
    requestedBy: request.requestedBy,
    requesterKind: request.requesterKind,
    useCase: request.useCase,
    correlationId: request.correlationId,
    riskAssessmentId: request.riskAssessmentId,
    safetyDecisionId: request.safetyDecisionId,
    riskLevel: request.riskLevel,
    riskMethodVersion: request.riskMethodVersion,
    status,
    requestedAt: request.requestedAt,
    expiresAt: request.expiresAt,
    ...(resolution ? {
      resolutionId: resolution.resolutionId,
      decision: resolution.decision,
      resolvedBy: resolution.resolvedBy,
      resolvedAt: resolution.resolvedAt,
      reasonCode: resolution.reasonCode,
    } : {}),
    ...(consumption ? {
      consumptionId: consumption.consumptionId,
      consumedBy: consumption.consumedBy,
      consumedAt: consumption.consumedAt,
      executionCorrelationId: consumption.executionCorrelationId,
    } : {}),
    sensitiveContentIncluded: false,
  });
}

export class HumanApprovalError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "HumanApprovalError";
    this.code = code;
    this.status = status;
  }
}

export function createGlobalTrustHumanApprovalService({
  store,
  integrity = createGlobalTrustIntegrityService({ store }),
  requestIdFactory = randomUUID,
  resolutionIdFactory = randomUUID,
  consumptionIdFactory = randomUUID,
  now = () => new Date().toISOString(),
  ttlMs = 15 * 60 * 1000,
} = {}) {
  if (typeof store?.transaction !== "function") throw new TypeError("store.transaction is required");
  if (typeof integrity?.appendInTransaction !== "function") throw new TypeError("integrity.appendInTransaction is required");
  for (const [name, factory] of Object.entries({ requestIdFactory, resolutionIdFactory, consumptionIdFactory, now })) {
    if (typeof factory !== "function") throw new TypeError(`${name} must be a function`);
  }
  if (!Number.isInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 86_400_000) {
    throw new RangeError("ttlMs must be between 60000 and 86400000");
  }

  function protect(tx, collection, id, payload) {
    integrity.appendInTransaction(tx, {
      tenantId: payload.tenantId,
      sourceCollection: collection,
      recordId: id,
      payload,
    });
  }

  return Object.freeze({
    async requestAuditQuery({
      identity,
      query,
      assessment,
      safetyDecision,
      correlationId,
    } = {}) {
      const principal = identity?.principal ?? {};
      const tenantId = required(principal.tenantId, "identity.principal.tenantId");
      const requesterId = required(principal.id, "identity.principal.id");
      const requesterKind = required(principal.kind ?? "unknown", "identity.principal.kind");
      if (safetyDecision?.outcome !== "pending_approval") {
        throw new HumanApprovalError("approval_not_required", "safety decision does not require approval", 400);
      }
      if (assessment?.tenantId !== tenantId || safetyDecision?.tenantId !== tenantId) {
        throw new HumanApprovalError("tenant_mismatch", "risk and safety decisions must match the requester tenant", 403);
      }
      if (safetyDecision.assessmentId !== assessment.assessmentId) {
        throw new HumanApprovalError("assessment_mismatch", "safety decision assessment does not match risk assessment", 409);
      }

      const requestedAt = instant(now(), "requestedAt");
      const expiresAt = new Date(Date.parse(requestedAt) + ttlMs).toISOString();
      const fingerprint = queryHash(query);
      const normalizedCorrelationId = required(correlationId, "correlationId");

      const transaction = await store.transaction((tx) => {
        const existing = valuesForTenant(tx, HUMAN_APPROVAL_REQUEST_COLLECTION, tenantId)
          .map((request) => stateFor(tx, tenantId, request, requestedAt))
          .find((state) =>
            state.status === "pending"
            && state.request.requestedBy === requesterId
            && state.request.queryHash === fingerprint
          );
        if (existing) return publicState(existing);

        const request = Object.freeze({
          contractType: "HumanApprovalRequest",
          contractVersion: "1.0",
          approvalRequestId: required(requestIdFactory(), "approvalRequestId"),
          tenantId,
          requestedBy: requesterId,
          requesterKind,
          useCase: "gateway.audit.events.read",
          queryHash: fingerprint,
          correlationId: normalizedCorrelationId,
          riskAssessmentId: required(assessment.assessmentId, "assessment.assessmentId"),
          safetyDecisionId: required(safetyDecision.safetyDecisionId, "safetyDecision.safetyDecisionId"),
          riskLevel: required(assessment.level, "assessment.level"),
          riskMethodVersion: required(assessment.methodVersion, "assessment.methodVersion"),
          requestedAt,
          expiresAt,
          sensitiveContentIncluded: false,
        });
        tx.put(HUMAN_APPROVAL_REQUEST_COLLECTION, request.approvalRequestId, request, { ifAbsent: true });
        protect(tx, HUMAN_APPROVAL_REQUEST_COLLECTION, request.approvalRequestId, request);
        return publicState(Object.freeze({
          request,
          resolution: undefined,
          consumption: undefined,
          status: "pending",
        }));
      });
      return transaction.result;
    },

    async listTenant({ tenantId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const currentTime = instant(now(), "currentTime");
      const transaction = await store.transaction((tx) =>
        valuesForTenant(tx, HUMAN_APPROVAL_REQUEST_COLLECTION, tenant)
          .map((request) => publicState(stateFor(tx, tenant, request, currentTime)))
          .sort((left, right) =>
            right.requestedAt.localeCompare(left.requestedAt)
            || left.approvalRequestId.localeCompare(right.approvalRequestId)
          )
      );
      return transaction.result;
    },

    async resolve({
      tenantId,
      approvalRequestId,
      identity,
      decision,
      reasonCode = "operator_decision",
    } = {}) {
      const tenant = required(tenantId, "tenantId");
      const requestId = required(approvalRequestId, "approvalRequestId");
      const principal = identity?.principal ?? {};
      const resolvedBy = required(principal.id, "identity.principal.id");
      if (principal.kind !== "human") {
        throw new HumanApprovalError("human_operator_required", "only a human principal may resolve an approval", 403);
      }
      if (!["approved", "rejected"].includes(decision)) {
        throw new HumanApprovalError("invalid_decision", "decision must be approved or rejected", 400);
      }
      const resolvedAt = instant(now(), "resolvedAt");

      const transaction = await store.transaction((tx) => {
        const request = tx.get(HUMAN_APPROVAL_REQUEST_COLLECTION, requestId);
        if (!request || request.tenantId !== tenant) {
          throw new HumanApprovalError("approval_not_found", "approval request was not found", 404);
        }
        const state = stateFor(tx, tenant, request, resolvedAt);
        if (state.status !== "pending") {
          throw new HumanApprovalError("approval_not_pending", `approval request is ${state.status}`, 409);
        }
        if (request.requestedBy === resolvedBy) {
          throw new HumanApprovalError("separation_of_duties_required", "requester cannot resolve their own approval", 403);
        }

        const resolution = Object.freeze({
          contractType: "HumanApprovalResolution",
          contractVersion: "1.0",
          resolutionId: required(resolutionIdFactory(), "resolutionId"),
          approvalRequestId: requestId,
          tenantId: tenant,
          decision,
          resolvedBy,
          resolvedAt,
          reasonCode: required(reasonCode, "reasonCode"),
          sensitiveContentIncluded: false,
        });
        tx.put(HUMAN_APPROVAL_RESOLUTION_COLLECTION, resolution.resolutionId, resolution, { ifAbsent: true });
        protect(tx, HUMAN_APPROVAL_RESOLUTION_COLLECTION, resolution.resolutionId, resolution);
        return publicState(Object.freeze({ request, resolution, consumption: undefined, status: decision }));
      });
      return transaction.result;
    },

    async consumeAuditQuery({
      tenantId,
      approvalRequestId,
      identity,
      query,
      correlationId,
      assessment,
      safetyDecision,
    } = {}) {
      const tenant = required(tenantId, "tenantId");
      const requestId = required(approvalRequestId, "approvalRequestId");
      const principal = identity?.principal ?? {};
      const consumedBy = required(principal.id, "identity.principal.id");
      const executionCorrelationId = required(correlationId, "correlationId");
      const consumedAt = instant(now(), "consumedAt");
      const fingerprint = queryHash(query);
      if (assessment?.tenantId !== tenant || safetyDecision?.tenantId !== tenant) {
        throw new HumanApprovalError("tenant_mismatch", "current risk and safety decisions must match the tenant", 403);
      }
      if (safetyDecision?.outcome !== "pending_approval") {
        throw new HumanApprovalError("approval_not_required", "current safety decision does not require approval", 400);
      }
      if (safetyDecision.assessmentId !== assessment?.assessmentId) {
        throw new HumanApprovalError("assessment_mismatch", "current safety decision does not match the risk assessment", 409);
      }

      const transaction = await store.transaction((tx) => {
        const request = tx.get(HUMAN_APPROVAL_REQUEST_COLLECTION, requestId);
        if (!request || request.tenantId !== tenant) {
          throw new HumanApprovalError("approval_not_found", "approval request was not found", 404);
        }
        const state = stateFor(tx, tenant, request, consumedAt);
        if (state.status === "expired") {
          throw new HumanApprovalError("approval_expired", "approval request has expired", 409);
        }
        if (state.status === "consumed") {
          throw new HumanApprovalError("approval_replay_blocked", "approval request has already been consumed", 409);
        }
        if (!state.resolution || state.resolution.decision !== "approved") {
          throw new HumanApprovalError(
            state.resolution?.decision === "rejected" ? "approval_rejected" : "approval_not_approved",
            state.resolution?.decision === "rejected"
              ? "approval request was rejected"
              : "approval request is still pending",
            409,
          );
        }
        if (request.requestedBy !== consumedBy) {
          throw new HumanApprovalError("requester_mismatch", "approval belongs to another requester", 403);
        }
        if (request.queryHash !== fingerprint) {
          throw new HumanApprovalError("query_mismatch", "approved query does not match the current query", 409);
        }
        if (request.riskLevel !== assessment.level || request.riskMethodVersion !== assessment.methodVersion) {
          throw new HumanApprovalError("risk_context_changed", "risk context changed after approval was requested", 409);
        }

        const consumption = Object.freeze({
          contractType: "HumanApprovalConsumption",
          contractVersion: "1.0",
          consumptionId: required(consumptionIdFactory(), "consumptionId"),
          approvalRequestId: requestId,
          resolutionId: state.resolution.resolutionId,
          tenantId: tenant,
          consumedBy,
          executionCorrelationId,
          consumedAt,
          sensitiveContentIncluded: false,
        });
        tx.put(HUMAN_APPROVAL_CONSUMPTION_COLLECTION, consumption.consumptionId, consumption, { ifAbsent: true });
        protect(tx, HUMAN_APPROVAL_CONSUMPTION_COLLECTION, consumption.consumptionId, consumption);
        return publicState(Object.freeze({
          request,
          resolution: state.resolution,
          consumption,
          status: "consumed",
        }));
      });
      return transaction.result;
    },
  });
}
