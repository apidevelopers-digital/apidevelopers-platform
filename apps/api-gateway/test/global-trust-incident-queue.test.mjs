import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createIncidentQueueOperationalGateway,
} from "../src/operational-incident-queue-composition.mjs";

function sequence(prefix) {
  let value = 0;
  return () => `${prefix}_${String(++value).padStart(3, "0")}`;
}

function principal(tenantId, id, scopes, kind = "human") {
  return { id, tenantId, kind, scopes };
}

function identity(tenantId, kind = "human") {
  return {
    principal: principal(
      tenantId,
      `${kind}_operator`,
      ["incident:read", "incident:write", "incident:manage"],
      kind,
    ),
  };
}

function request(apiKey, method, url, body, headers = {}) {
  return {
    method,
    url,
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      "x-correlation-id": "corr_http",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

const confirmation = {
  "x-operation-confirmation": "IGOR_APROVA_EXECUCAO",
};

function gatewayOptions(stateFilePath) {
  return {
    stateFilePath,
    adminKey: "operator-key",
    adminPrincipal: principal(
      "tenant_001",
      "operator_001",
      ["incident:read", "incident:write", "incident:manage"],
    ),
    incidentIdFactory: sequence("incident"),
    incidentEventIdFactory: sequence("event"),
    incidentProofIdFactory: sequence("proof"),
  };
}

test("incident queue preserves tenant isolation, lifecycle and integrity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "incident-queue-"));
  const stateFilePath = join(directory, "state.json");

  try {
    const gateway = createIncidentQueueOperationalGateway(gatewayOptions(stateFilePath));
    const created = await gateway.incidentQueue.create({
      identity: identity("tenant_001", "service"),
      category: "prompt_injection",
      severity: "critical",
      sourceType: "prompt_defense",
      correlationId: "corr_001",
      evidenceRefs: ["prompt_decision_001", "risk_assessment_001"],
    });

    assert.equal(created.status, "open");
    assert.equal(created.rawPayloadIncluded, false);
    assert.equal(created.automaticRemediationExecuted, false);

    await assert.rejects(
      gateway.incidentQueue.transition({
        tenantId: "tenant_001",
        incidentId: created.incidentId,
        identity: identity("tenant_001", "service"),
        status: "triaged",
      }),
      (error) => error?.code === "human_operator_required",
    );

    const triaged = await gateway.incidentQueue.transition({
      tenantId: "tenant_001",
      incidentId: created.incidentId,
      identity: identity("tenant_001"),
      status: "triaged",
      reasonCode: "operator_triage",
    });
    assert.equal(triaged.status, "triaged");

    await assert.rejects(
      gateway.incidentQueue.transition({
        tenantId: "tenant_001",
        incidentId: created.incidentId,
        identity: identity("tenant_001"),
        status: "open",
      }),
      (error) => error?.code === "invalid_status_transition",
    );

    assert.equal(
      (await gateway.incidentQueue.listTenant({ tenantId: "tenant_other" })).length,
      0,
    );

    const history = await gateway.incidentQueue.history({
      tenantId: "tenant_001",
      incidentId: created.incidentId,
    });
    assert.deepEqual(history.map((event) => event.toStatus), ["open", "triaged"]);

    const verification = await gateway.incidentIntegrity.verifyTenant({
      tenantId: "tenant_001",
    });
    assert.equal(verification.valid, true);
    assert.equal(verification.protectedRecordCount, 3);
    assert.equal(verification.proofCount, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("incident HTTP requires confirmation and scopes without remediation endpoint", async () => {
  const directory = await mkdtemp(join(tmpdir(), "incident-http-"));
  const stateFilePath = join(directory, "state.json");

  try {
    const operator = createIncidentQueueOperationalGateway(gatewayOptions(stateFilePath));
    const body = {
      category: "unsafe_output",
      severity: "high",
      sourceType: "output_validator",
      correlationId: "corr_output_001",
      evidenceRefs: ["output_decision_001"],
    };

    const missing = await operator.app.handleRequest(
      request("operator-key", "POST", "/v1/global-trust/incidents", body),
    );
    assert.equal(missing.status, 428);

    const injected = await operator.app.handleRequest(
      request(
        "operator-key",
        "POST",
        "/v1/global-trust/incidents",
        { ...body, tenantId: "tenant_other" },
        confirmation,
      ),
    );
    assert.equal(injected.status, 400);

    const createdResponse = await operator.app.handleRequest(
      request(
        "operator-key",
        "POST",
        "/v1/global-trust/incidents",
        body,
        confirmation,
      ),
    );
    assert.equal(createdResponse.status, 201);
    const created = JSON.parse(createdResponse.body);
    const incidentId = created.incident.incidentId;
    assert.equal(created.incident.tenantId, "tenant_001");
    assert.equal(created.automaticRemediationExecuted, false);

    const triaged = await operator.app.handleRequest(
      request(
        "operator-key",
        "POST",
        `/v1/global-trust/incidents/${incidentId}/status`,
        { status: "triaged", reasonCode: "operator_triage" },
        confirmation,
      ),
    );
    assert.equal(triaged.status, 200);

    const list = await operator.app.handleRequest(
      request("operator-key", "GET", "/v1/global-trust/incidents?status=triaged"),
    );
    assert.equal(JSON.parse(list.body).count, 1);

    const history = await operator.app.handleRequest(
      request(
        "operator-key",
        "GET",
        `/v1/global-trust/incidents/${incidentId}/history`,
      ),
    );
    assert.equal(JSON.parse(history.body).count, 2);

    const integrity = await operator.app.handleRequest(
      request("operator-key", "GET", "/v1/global-trust/incidents/integrity"),
    );
    assert.equal(JSON.parse(integrity.body).verification.valid, true);

    const reader = createIncidentQueueOperationalGateway({
      stateFilePath,
      adminKey: "reader-key",
      adminPrincipal: principal("tenant_001", "reader_001", ["incident:read"]),
    });
    const forbidden = await reader.app.handleRequest(
      request(
        "reader-key",
        "POST",
        `/v1/global-trust/incidents/${incidentId}/status`,
        { status: "investigating" },
        confirmation,
      ),
    );
    assert.equal(forbidden.status, 403);

    const remediation = await operator.app.handleRequest(
      request(
        "operator-key",
        "POST",
        `/v1/global-trust/incidents/${incidentId}/remediate`,
        {},
        confirmation,
      ),
    );
    assert.equal(remediation.status, 404);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
