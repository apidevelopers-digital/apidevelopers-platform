import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";

import { createGlobalTrustObservabilityService } from "../src/global-trust-observability.mjs";
import { createOperationalGateway } from "../src/operational-composition.mjs";

test("aggregates only Global Trust records from the requested tenant", async () => {
  const directory = await mkdtemp(join(tmpdir(), "global-trust-observability-"));
  try {
    const store = createJsonFileStore({ filePath: join(directory, "state.json") });
    await store.transaction((tx) => {
      tx.put("global_trust_audit_events", "event_a", {
        tenantId: "tenant_a",
        sensitiveContentIncluded: false,
      });
      tx.put("global_trust_audit_events", "event_b", {
        tenantId: "tenant_b",
        sensitiveContentIncluded: true,
        secret: "must-not-leak",
      });
      tx.put("global_trust_authorization_decisions", "auth_a", {
        tenantId: "tenant_a",
        effect: "allow",
      });
      tx.put("global_trust_authorization_decisions", "auth_b", {
        tenantId: "tenant_b",
        effect: "deny",
      });
      tx.put("global_trust_risk_assessments", "risk_a", {
        tenantId: "tenant_a",
        level: "low",
      });
      tx.put("global_trust_safety_decisions", "safety_a", {
        tenantId: "tenant_a",
        outcome: "allow",
      });
      tx.put("global_trust_decision_evidence", "evidence_a", {
        tenantId: "tenant_a",
        outcome: "allowed",
      });
    });

    const service = createGlobalTrustObservabilityService({
      store,
      now: () => "2026-07-28T12:00:00.000Z",
    });
    const snapshot = await service.snapshotTenant({ tenantId: "tenant_a" });

    assert.equal(snapshot.contractType, "GlobalTrustObservabilitySnapshot");
    assert.equal(snapshot.auditEvents.total, 1);
    assert.equal(snapshot.auditEvents.sensitiveContentIncluded, false);
    assert.equal(snapshot.authorization.total, 1);
    assert.equal(snapshot.authorization.allow, 1);
    assert.equal(snapshot.authorization.deny, 0);
    assert.equal(snapshot.risk.low, 1);
    assert.equal(snapshot.safety.allow, 1);
    assert.equal(snapshot.evidence.allowed, 1);
    assert.equal(snapshot.sensitiveContentIncluded, false);
    assert.equal(JSON.stringify(snapshot).includes("tenant_b"), false);
    assert.equal(JSON.stringify(snapshot).includes("must-not-leak"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("exposes an authorized tenant-isolated operational snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "global-trust-observability-http-"));
  try {
    const authorizationIds = ["decision_query", "decision_observability"];
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
      globalTrustObservabilityNow: () => "2026-07-28T12:00:04.000Z",
    });

    await gateway.app.handleRequest({
      method: "GET",
      url: "/v1/whoami",
      headers: {
        "x-api-key": "admin-secret",
        "x-correlation-id": "source_corr",
      },
    });

    const queryResponse = await gateway.app.handleRequest({
      method: "GET",
      url: "/v1/audit-events?correlationId=source_corr&limit=10",
      headers: {
        "x-api-key": "admin-secret",
        "x-correlation-id": "query_corr",
      },
    });
    assert.equal(queryResponse.status, 200);

    const response = await gateway.app.handleRequest({
      method: "GET",
      url: "/v1/global-trust/observability",
      headers: { "x-api-key": "admin-secret" },
    });

    assert.equal(response.status, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.tenantId, "tenant_001");
    assert.equal(body.authorizationDecision.effect, "allow");
    assert.equal(body.snapshot.auditEvents.total, 1);
    assert.equal(body.snapshot.authorization.total, 1);
    assert.equal(body.snapshot.authorization.allow, 1);
    assert.equal(body.snapshot.risk.total, 1);
    assert.equal(body.snapshot.risk.low, 1);
    assert.equal(body.snapshot.safety.total, 1);
    assert.equal(body.snapshot.safety.allow, 1);
    assert.equal(body.snapshot.evidence.total, 1);
    assert.equal(body.snapshot.evidence.allowed, 1);
    assert.equal(body.snapshot.sensitiveContentIncluded, false);
    assert.equal(JSON.stringify(body).includes("admin-secret"), false);

    const otherTenantGateway = createOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "other-secret",
      adminPrincipal: {
        id: "actor_002",
        tenantId: "tenant_002",
        kind: "human",
        scopes: ["audit:read"],
      },
      authorizationIdFactory: () => "decision_other_tenant",
      globalTrustObservabilityNow: () => "2026-07-28T12:00:05.000Z",
    });
    const otherTenantResponse = await otherTenantGateway.app.handleRequest({
      method: "GET",
      url: "/v1/global-trust/observability",
      headers: { "x-api-key": "other-secret" },
    });
    assert.equal(otherTenantResponse.status, 200);
    const otherTenantBody = JSON.parse(otherTenantResponse.body);
    assert.equal(otherTenantBody.snapshot.auditEvents.total, 0);
    assert.equal(otherTenantBody.snapshot.authorization.total, 0);
    assert.equal(otherTenantBody.snapshot.risk.total, 0);
    assert.equal(otherTenantBody.snapshot.safety.total, 0);
    assert.equal(otherTenantBody.snapshot.evidence.total, 0);
    assert.equal(JSON.stringify(otherTenantBody).includes("tenant_001"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("denies the observability endpoint when audit:read is absent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "global-trust-observability-deny-"));
  try {
    const gateway = createOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "admin-secret",
      adminPrincipal: {
        id: "actor_003",
        tenantId: "tenant_003",
        kind: "human",
        scopes: [],
      },
      authorizationIdFactory: () => "decision_denied",
    });

    const response = await gateway.app.handleRequest({
      method: "GET",
      url: "/v1/global-trust/observability",
      headers: { "x-api-key": "admin-secret" },
    });

    assert.equal(response.status, 403);
    const body = JSON.parse(response.body);
    assert.equal(body.error, "forbidden");
    assert.equal(body.authorizationDecision.effect, "deny");
    assert.deepEqual(body.authorizationDecision.reasonCodes, [
      "missing_scope:audit:read",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
