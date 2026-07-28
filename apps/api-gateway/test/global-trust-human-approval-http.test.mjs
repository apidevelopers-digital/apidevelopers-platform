import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOperationalGateway } from "../src/operational-composition.mjs";

function request(apiKey, method, url, headers = {}) {
  return {
    method,
    url,
    headers: {
      "x-api-key": apiKey,
      ...headers,
    },
  };
}

test("runs a high-risk audit query only after a separate human approval and blocks replay", async () => {
  const directory = await mkdtemp(join(tmpdir(), "human-approval-http-"));
  const stateFilePath = join(directory, "state.json");
  try {
    const requesterGateway = createOperationalGateway({
      stateFilePath,
      adminKey: "service-secret",
      adminPrincipal: {
        id: "service_001",
        tenantId: "tenant_001",
        kind: "service",
        scopes: ["audit:read"],
      },
    });

    const whoami = await requesterGateway.app.handleRequest(
      request("service-secret", "GET", "/v1/whoami", {
        "x-correlation-id": "source_corr",
      }),
    );
    assert.equal(whoami.status, 200);

    const pendingResponse = await requesterGateway.app.handleRequest(
      request("service-secret", "GET", "/v1/audit-events?limit=150", {
        "x-correlation-id": "request_corr",
      }),
    );
    assert.equal(pendingResponse.status, 202);
    const pending = JSON.parse(pendingResponse.body);
    assert.equal(pending.error, "human_approval_required");
    assert.equal(pending.riskAssessment.level, "high");
    assert.equal(pending.safetyDecision.outcome, "pending_approval");
    assert.equal(pending.humanApproval.status, "pending");
    assert.equal(pending.humanApproval.requestedBy, "service_001");
    assert.equal(pending.humanApproval.sensitiveContentIncluded, false);
    assert.equal(
      pending.decisionEvidence.humanApprovalRequestId,
      pending.humanApproval.approvalRequestId,
    );

    const approverGateway = createOperationalGateway({
      stateFilePath,
      adminKey: "operator-secret",
      adminPrincipal: {
        id: "operator_001",
        tenantId: "tenant_001",
        kind: "human",
        scopes: ["audit:read", "audit:write"],
      },
    });

    const listResponse = await approverGateway.app.handleRequest(
      request("operator-secret", "GET", "/v1/global-trust/approvals?status=pending"),
    );
    assert.equal(listResponse.status, 200);
    const list = JSON.parse(listResponse.body);
    assert.equal(list.count, 1);
    assert.equal(list.approvals[0].approvalRequestId, pending.humanApproval.approvalRequestId);
    assert.equal(JSON.stringify(list).includes("service-secret"), false);

    const resolutionResponse = await approverGateway.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        `/v1/global-trust/approvals/${encodeURIComponent(pending.humanApproval.approvalRequestId)}/resolution`,
        {
          "x-approval-decision": "approved",
          "x-approval-reason": "operator_reviewed",
        },
      ),
    );
    assert.equal(resolutionResponse.status, 200);
    const resolution = JSON.parse(resolutionResponse.body);
    assert.equal(resolution.approval.status, "approved");
    assert.equal(resolution.approval.resolvedBy, "operator_001");

    const executionResponse = await requesterGateway.app.handleRequest(
      request("service-secret", "GET", "/v1/audit-events?limit=150", {
        "x-correlation-id": "execution_corr",
        "x-human-approval-id": pending.humanApproval.approvalRequestId,
      }),
    );
    assert.equal(executionResponse.status, 200);
    const execution = JSON.parse(executionResponse.body);
    assert.equal(execution.humanApproval.status, "consumed");
    assert.equal(execution.humanApproval.consumedBy, "service_001");
    assert.equal(execution.decisionEvidence.outcome, "allowed_after_human_approval");
    assert.equal(
      execution.decisionEvidence.humanApprovalConsumptionId,
      execution.humanApproval.consumptionId,
    );
    assert.equal(execution.count >= 1, true);
    assert.equal(JSON.stringify(execution).includes("service-secret"), false);

    const replayResponse = await requesterGateway.app.handleRequest(
      request("service-secret", "GET", "/v1/audit-events?limit=150", {
        "x-correlation-id": "replay_corr",
        "x-human-approval-id": pending.humanApproval.approvalRequestId,
      }),
    );
    assert.equal(replayResponse.status, 409);
    const replay = JSON.parse(replayResponse.body);
    assert.equal(replay.error, "approval_replay_blocked");

    const integrityResponse = await approverGateway.app.handleRequest(
      request("operator-secret", "GET", "/v1/global-trust/integrity"),
    );
    assert.equal(integrityResponse.status, 200);
    const integrity = JSON.parse(integrityResponse.body);
    assert.equal(integrity.verification.valid, true);
    assert.equal(integrity.verification.proofCount >= 1, true);

    const otherTenantGateway = createOperationalGateway({
      stateFilePath,
      adminKey: "other-secret",
      adminPrincipal: {
        id: "operator_other",
        tenantId: "tenant_other",
        kind: "human",
        scopes: ["audit:read", "audit:write"],
      },
    });
    const otherTenantListResponse = await otherTenantGateway.app.handleRequest(
      request("other-secret", "GET", "/v1/global-trust/approvals"),
    );
    assert.equal(otherTenantListResponse.status, 200);
    const otherTenantList = JSON.parse(otherTenantListResponse.body);
    assert.equal(otherTenantList.count, 0);
    assert.deepEqual(otherTenantList.approvals, []);
    assert.equal(JSON.stringify(otherTenantList).includes("tenant_001"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("requires audit:write and a distinct human operator to resolve approvals", async () => {
  const directory = await mkdtemp(join(tmpdir(), "human-approval-http-deny-"));
  const stateFilePath = join(directory, "state.json");
  try {
    const requesterGateway = createOperationalGateway({
      stateFilePath,
      adminKey: "service-secret",
      adminPrincipal: {
        id: "service_002",
        tenantId: "tenant_002",
        kind: "service",
        scopes: ["audit:read"],
      },
    });

    const pendingResponse = await requesterGateway.app.handleRequest(
      request("service-secret", "GET", "/v1/audit-events?limit=150"),
    );
    assert.equal(pendingResponse.status, 202);
    const pending = JSON.parse(pendingResponse.body);

    const readOnlyHumanGateway = createOperationalGateway({
      stateFilePath,
      adminKey: "readonly-secret",
      adminPrincipal: {
        id: "operator_readonly",
        tenantId: "tenant_002",
        kind: "human",
        scopes: ["audit:read"],
      },
    });
    const deniedResponse = await readOnlyHumanGateway.app.handleRequest(
      request(
        "readonly-secret",
        "POST",
        `/v1/global-trust/approvals/${pending.humanApproval.approvalRequestId}/resolution`,
        { "x-approval-decision": "approved" },
      ),
    );
    assert.equal(deniedResponse.status, 403);
    const denied = JSON.parse(deniedResponse.body);
    assert.equal(denied.error, "forbidden");
    assert.deepEqual(denied.authorizationDecision.reasonCodes, [
      "missing_scope:audit:write",
    ]);

    const requesterWithWriteGateway = createOperationalGateway({
      stateFilePath,
      adminKey: "requester-write-secret",
      adminPrincipal: {
        id: "service_002",
        tenantId: "tenant_002",
        kind: "service",
        scopes: ["audit:read", "audit:write"],
      },
    });
    const serviceResolutionResponse = await requesterWithWriteGateway.app.handleRequest(
      request(
        "requester-write-secret",
        "POST",
        `/v1/global-trust/approvals/${pending.humanApproval.approvalRequestId}/resolution`,
        { "x-approval-decision": "approved" },
      ),
    );
    assert.equal(serviceResolutionResponse.status, 403);
    const serviceResolution = JSON.parse(serviceResolutionResponse.body);
    assert.equal(serviceResolution.error, "human_operator_required");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
