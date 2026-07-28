import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";

import {
  HUMAN_APPROVAL_CONSUMPTION_COLLECTION,
  HUMAN_APPROVAL_REQUEST_COLLECTION,
  HUMAN_APPROVAL_RESOLUTION_COLLECTION,
  createGlobalTrustHumanApprovalService,
} from "../src/global-trust-human-approval.mjs";
import { createGlobalTrustIntegrityService } from "../src/global-trust-integrity.mjs";

function riskContext(tenantId = "tenant_001") {
  const assessment = Object.freeze({
    contractType: "RiskAssessment",
    contractVersion: "1.0",
    assessmentId: "assessment_001",
    subjectId: "service_001",
    tenantId,
    useCase: "gateway.audit.events.read",
    score: 55,
    level: "high",
    factors: Object.freeze(["large_result_window", "service_principal"]),
    methodVersion: "gateway-risk-v1",
    assessedAt: "2026-07-28T12:00:00.000Z",
  });
  const safetyDecision = Object.freeze({
    contractType: "SafetyDecision",
    contractVersion: "1.0",
    safetyDecisionId: "safety_001",
    assessmentId: assessment.assessmentId,
    tenantId,
    outcome: "pending_approval",
    controls: Object.freeze(["human_approval"]),
    reasonCodes: Object.freeze(["risk_level:high"]),
    decidedAt: "2026-07-28T12:00:00.000Z",
  });
  return { assessment, safetyDecision };
}

test("creates, resolves and consumes a tenant approval exactly once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "human-approval-"));
  try {
    const store = createJsonFileStore({ filePath: join(directory, "state.json") });
    let proofSequence = 0;
    let currentTime = "2026-07-28T12:00:00.000Z";
    const integrity = createGlobalTrustIntegrityService({
      store,
      idFactory: () => `proof_${String(++proofSequence).padStart(3, "0")}`,
      now: () => currentTime,
    });
    const service = createGlobalTrustHumanApprovalService({
      store,
      integrity,
      requestIdFactory: () => "approval_001",
      resolutionIdFactory: () => "resolution_001",
      consumptionIdFactory: () => "consumption_001",
      now: () => currentTime,
      ttlMs: 15 * 60 * 1000,
    });

    const requester = {
      principal: {
        id: "service_001",
        tenantId: "tenant_001",
        kind: "service",
      },
    };
    const approver = {
      principal: {
        id: "operator_001",
        tenantId: "tenant_001",
        kind: "human",
      },
    };
    const query = { correlationId: "source_corr", limit: "150" };
    const { assessment, safetyDecision } = riskContext();

    const requested = await service.requestAuditQuery({
      identity: requester,
      query,
      assessment,
      safetyDecision,
      correlationId: "request_corr",
    });
    assert.equal(requested.status, "pending");
    assert.equal(requested.approvalRequestId, "approval_001");
    assert.equal(requested.riskMethodVersion, "gateway-risk-v1");
    assert.equal(requested.sensitiveContentIncluded, false);

    const duplicate = await service.requestAuditQuery({
      identity: requester,
      query,
      assessment,
      safetyDecision,
      correlationId: "another_corr",
    });
    assert.equal(duplicate.approvalRequestId, requested.approvalRequestId);

    await assert.rejects(
      service.resolve({
        tenantId: "tenant_001",
        approvalRequestId: requested.approvalRequestId,
        identity: requester,
        decision: "approved",
      }),
      (error) => error.code === "human_operator_required",
    );

    currentTime = "2026-07-28T12:01:00.000Z";
    const approved = await service.resolve({
      tenantId: "tenant_001",
      approvalRequestId: requested.approvalRequestId,
      identity: approver,
      decision: "approved",
      reasonCode: "operator_reviewed",
    });
    assert.equal(approved.status, "approved");
    assert.equal(approved.resolvedBy, "operator_001");

    await assert.rejects(
      service.consumeAuditQuery({
        tenantId: "tenant_001",
        approvalRequestId: requested.approvalRequestId,
        identity: requester,
        query: { correlationId: "source_corr", limit: "149" },
        correlationId: "execution_wrong",
        assessment,
        safetyDecision,
      }),
      (error) => error.code === "query_mismatch",
    );

    currentTime = "2026-07-28T12:02:00.000Z";
    const consumed = await service.consumeAuditQuery({
      tenantId: "tenant_001",
      approvalRequestId: requested.approvalRequestId,
      identity: requester,
      query,
      correlationId: "execution_corr",
      assessment,
      safetyDecision,
    });
    assert.equal(consumed.status, "consumed");
    assert.equal(consumed.consumptionId, "consumption_001");
    assert.equal(consumed.executionCorrelationId, "execution_corr");

    await assert.rejects(
      service.consumeAuditQuery({
        tenantId: "tenant_001",
        approvalRequestId: requested.approvalRequestId,
        identity: requester,
        query,
        correlationId: "replay_corr",
        assessment,
        safetyDecision,
      }),
      (error) => error.code === "approval_replay_blocked",
    );

    const approvals = await service.listTenant({ tenantId: "tenant_001" });
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0].status, "consumed");
    assert.deepEqual(await service.listTenant({ tenantId: "tenant_other" }), []);

    const verification = await integrity.verifyTenant({ tenantId: "tenant_001" });
    assert.equal(verification.valid, true);
    assert.equal(verification.proofCount, 3);
    assert.equal(verification.protectedRecordCount, 3);

    const stored = await store.transaction((tx) => ({
      requests: tx.list(HUMAN_APPROVAL_REQUEST_COLLECTION),
      resolutions: tx.list(HUMAN_APPROVAL_RESOLUTION_COLLECTION),
      consumptions: tx.list(HUMAN_APPROVAL_CONSUMPTION_COLLECTION),
    }));
    assert.equal(stored.result.requests.length, 1);
    assert.equal(stored.result.resolutions.length, 1);
    assert.equal(stored.result.consumptions.length, 1);
    assert.equal(JSON.stringify(stored.result).includes("secret"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("blocks resolution after expiry and detects changed risk context", async () => {
  const directory = await mkdtemp(join(tmpdir(), "human-approval-expiry-"));
  try {
    const store = createJsonFileStore({ filePath: join(directory, "state.json") });
    let currentTime = "2026-07-28T12:00:00.000Z";
    const integrity = createGlobalTrustIntegrityService({ store, now: () => currentTime });
    const service = createGlobalTrustHumanApprovalService({
      store,
      integrity,
      requestIdFactory: () => "approval_expiring",
      now: () => currentTime,
      ttlMs: 60_000,
    });
    const requester = { principal: { id: "service_002", tenantId: "tenant_002", kind: "service" } };
    const approver = { principal: { id: "operator_002", tenantId: "tenant_002", kind: "human" } };
    const query = { limit: "150" };
    const { assessment, safetyDecision } = riskContext("tenant_002");

    const requested = await service.requestAuditQuery({
      identity: requester,
      query,
      assessment: { ...assessment, subjectId: "service_002", tenantId: "tenant_002" },
      safetyDecision: { ...safetyDecision, tenantId: "tenant_002" },
      correlationId: "expiry_corr",
    });

    currentTime = "2026-07-28T12:02:00.000Z";
    await assert.rejects(
      service.resolve({
        tenantId: "tenant_002",
        approvalRequestId: requested.approvalRequestId,
        identity: approver,
        decision: "approved",
      }),
      (error) => error.code === "approval_not_pending",
    );

    const listed = await service.listTenant({ tenantId: "tenant_002" });
    assert.equal(listed[0].status, "expired");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
