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

test("blocks audit queries while active and allows an explicitly confirmed human reversal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kill-switch-http-"));
  const stateFilePath = join(directory, "state.json");

  try {
    const operator = createOperationalGateway({
      stateFilePath,
      adminKey: "operator-secret",
      adminPrincipal: {
        id: "operator_001",
        tenantId: "tenant_001",
        kind: "human",
        scopes: ["audit:read", "audit:write"],
      },
    });

    const requester = createOperationalGateway({
      stateFilePath,
      adminKey: "requester-secret",
      adminPrincipal: {
        id: "human_reader_001",
        tenantId: "tenant_001",
        kind: "human",
        scopes: ["audit:read"],
      },
    });

    const missingConfirmation = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/kill-switch",
        {
          "x-kill-switch-enabled": "true",
          "x-kill-switch-reason": "incident_containment",
          "x-correlation-id": "corr_missing",
        },
      ),
    );
    assert.equal(missingConfirmation.status, 428);

    const activatedResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/kill-switch",
        {
          "x-operation-confirmation": "IGOR_APROVA_EXECUCAO",
          "x-kill-switch-enabled": "true",
          "x-kill-switch-reason": "incident_containment",
          "x-correlation-id": "corr_activate",
        },
      ),
    );
    assert.equal(activatedResponse.status, 200);
    const activated = JSON.parse(activatedResponse.body);
    assert.equal(activated.state.enabled, true);
    assert.equal(activated.state.changedBy, "operator_001");
    assert.equal(activated.state.sensitiveContentIncluded, false);

    const blockedResponse = await requester.app.handleRequest(
      request(
        "requester-secret",
        "GET",
        "/v1/audit-events?limit=1",
        { "x-correlation-id": "corr_blocked" },
      ),
    );
    assert.equal(blockedResponse.status, 423);
    const blocked = JSON.parse(blockedResponse.body);
    assert.equal(blocked.error, "kill_switch_active");
    assert.equal(blocked.killSwitch.enabled, true);
    assert.equal(blocked.decisionEvidence.outcome, "kill_switch_blocked");
    assert.equal(
      blocked.decisionEvidence.killSwitchEventId,
      blocked.killSwitch.killSwitchEventId,
    );
    assert.equal(JSON.stringify(blocked).includes("operator-secret"), false);
    assert.equal(JSON.stringify(blocked).includes("requester-secret"), false);

    const readResponse = await operator.app.handleRequest(
      request("operator-secret", "GET", "/v1/global-trust/kill-switch"),
    );
    assert.equal(readResponse.status, 200);
    const read = JSON.parse(readResponse.body);
    assert.equal(read.state.enabled, true);

    const disabledResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/kill-switch",
        {
          "x-operation-confirmation": "IGOR_APROVA_EXECUCAO",
          "x-kill-switch-enabled": "false",
          "x-kill-switch-reason": "incident_resolved",
          "x-correlation-id": "corr_disable",
        },
      ),
    );
    assert.equal(disabledResponse.status, 200);
    const disabled = JSON.parse(disabledResponse.body);
    assert.equal(disabled.state.enabled, false);
    assert.equal(disabled.state.version, 2);

    const allowedResponse = await requester.app.handleRequest(
      request(
        "requester-secret",
        "GET",
        "/v1/audit-events?limit=1",
        { "x-correlation-id": "corr_allowed" },
      ),
    );
    assert.equal(allowedResponse.status, 200);
    const allowed = JSON.parse(allowedResponse.body);
    assert.equal(allowed.tenantId, "tenant_001");

    const integrityResponse = await operator.app.handleRequest(
      request("operator-secret", "GET", "/v1/global-trust/integrity"),
    );
    assert.equal(integrityResponse.status, 200);
    const integrity = JSON.parse(integrityResponse.body);
    assert.equal(integrity.verification.valid, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps kill switch state tenant-isolated and rejects non-human changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kill-switch-isolation-"));
  const stateFilePath = join(directory, "state.json");

  try {
    const tenantA = createOperationalGateway({
      stateFilePath,
      adminKey: "tenant-a-secret",
      adminPrincipal: {
        id: "operator_a",
        tenantId: "tenant_a",
        kind: "human",
        scopes: ["audit:read", "audit:write"],
      },
    });
    const tenantB = createOperationalGateway({
      stateFilePath,
      adminKey: "tenant-b-secret",
      adminPrincipal: {
        id: "operator_b",
        tenantId: "tenant_b",
        kind: "human",
        scopes: ["audit:read", "audit:write"],
      },
    });
    const servicePrincipal = createOperationalGateway({
      stateFilePath,
      adminKey: "service-secret",
      adminPrincipal: {
        id: "service_a",
        tenantId: "tenant_a",
        kind: "service",
        scopes: ["audit:read", "audit:write"],
      },
    });

    const active = await tenantA.app.handleRequest(
      request(
        "tenant-a-secret",
        "POST",
        "/v1/global-trust/kill-switch",
        {
          "x-operation-confirmation": "IGOR_APROVA_EXECUCAO",
          "x-kill-switch-enabled": "true",
          "x-kill-switch-reason": "tenant_a_incident",
          "x-correlation-id": "corr_a",
        },
      ),
    );
    assert.equal(active.status, 200);

    const tenantBState = await tenantB.app.handleRequest(
      request("tenant-b-secret", "GET", "/v1/global-trust/kill-switch"),
    );
    assert.equal(tenantBState.status, 200);
    const tenantBBody = JSON.parse(tenantBState.body);
    assert.equal(tenantBBody.state.enabled, false);
    assert.equal(JSON.stringify(tenantBBody).includes("tenant_a"), false);

    const denied = await servicePrincipal.app.handleRequest(
      request(
        "service-secret",
        "POST",
        "/v1/global-trust/kill-switch",
        {
          "x-operation-confirmation": "IGOR_APROVA_EXECUCAO",
          "x-kill-switch-enabled": "false",
          "x-kill-switch-reason": "unauthorized_service_change",
          "x-correlation-id": "corr_service",
        },
      ),
    );
    assert.equal(denied.status, 403);
    const deniedBody = JSON.parse(denied.body);
    assert.equal(deniedBody.error, "human_operator_required");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
