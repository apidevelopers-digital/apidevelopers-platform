import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createModelRegisteredOperationalGateway } from "../src/operational-model-registry-composition.mjs";

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

function principal(tenantId, id, kind, scopes) {
  return { id, tenantId, kind, scopes };
}

test("exposes tenant model registry without contacting or executing a provider", async () => {
  const directory = await mkdtemp(join(tmpdir(), "model-registry-http-"));
  const stateFilePath = join(directory, "state.json");

  try {
    const operator = createModelRegisteredOperationalGateway({
      stateFilePath,
      adminKey: "operator-secret",
      adminPrincipal: principal(
        "tenant_001",
        "operator_001",
        "human",
        ["model:read", "model:write"],
      ),
    });

    const registrationBody = {
      modelId: "model_support_v1",
      provider: "provider_a",
      model: "safe-model",
      version: "2026-07-01",
      purpose: "customer_support",
      dataPolicyId: "policy_support_v1",
      allowedLocales: ["pt-BR", "en-US"],
      reasonCode: "initial_registration",
      correlationId: "corr_register",
    };

    const missingConfirmation = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/models",
        registrationBody,
      ),
    );
    assert.equal(missingConfirmation.status, 428);

    const injectedTenant = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/models",
        { ...registrationBody, tenantId: "tenant_other" },
        { "x-operation-confirmation": "IGOR_APROVA_EXECUCAO" },
      ),
    );
    assert.equal(injectedTenant.status, 400);

    const registeredResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/models",
        registrationBody,
        { "x-operation-confirmation": "IGOR_APROVA_EXECUCAO" },
      ),
    );
    assert.equal(registeredResponse.status, 201);
    const registered = JSON.parse(registeredResponse.body);
    assert.equal(registered.tenantId, "tenant_001");
    assert.equal(registered.event.descriptor.status, "candidate");
    assert.equal(registered.executedModel, false);
    assert.equal(registered.providerContacted, false);

    const approvedResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/models/model_support_v1/status",
        {
          status: "approved",
          reasonCode: "evaluation_passed",
          correlationId: "corr_approve",
        },
        { "x-operation-confirmation": "IGOR_APROVA_EXECUCAO" },
      ),
    );
    assert.equal(approvedResponse.status, 200);
    const approved = JSON.parse(approvedResponse.body);
    assert.equal(approved.result.descriptor.status, "approved");
    assert.equal(approved.executedModel, false);
    assert.equal(approved.providerContacted, false);

    const listResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "GET",
        "/v1/global-trust/models?status=approved",
      ),
    );
    assert.equal(listResponse.status, 200);
    const list = JSON.parse(listResponse.body);
    assert.equal(list.count, 1);
    assert.equal(list.models[0].tenantId, "tenant_001");
    assert.equal(list.sensitiveContentIncluded, false);
    assert.equal(JSON.stringify(list).includes("operator-secret"), false);

    const historyResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "GET",
        "/v1/global-trust/models/model_support_v1/history",
      ),
    );
    assert.equal(historyResponse.status, 200);
    const history = JSON.parse(historyResponse.body);
    assert.equal(history.count, 2);

    const integrityResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "GET",
        "/v1/global-trust/models/integrity",
      ),
    );
    assert.equal(integrityResponse.status, 200);
    const integrity = JSON.parse(integrityResponse.body);
    assert.equal(integrity.verification.valid, true);
    assert.equal(integrity.verification.proofCount, 2);

    const executeResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/models/model_support_v1/execute",
        {},
        { "x-operation-confirmation": "IGOR_APROVA_EXECUCAO" },
      ),
    );
    assert.equal(executeResponse.status, 404);

    const otherTenant = createModelRegisteredOperationalGateway({
      stateFilePath,
      adminKey: "other-secret",
      adminPrincipal: principal(
        "tenant_other",
        "operator_other",
        "human",
        ["model:read", "model:write"],
      ),
    });
    const otherListResponse = await otherTenant.app.handleRequest(
      request("other-secret", "GET", "/v1/global-trust/models"),
    );
    assert.equal(otherListResponse.status, 200);
    const otherList = JSON.parse(otherListResponse.body);
    assert.equal(otherList.count, 0);
    assert.deepEqual(otherList.models, []);
    assert.equal(JSON.stringify(otherList).includes("tenant_001"), false);

    const servicePrincipal = createModelRegisteredOperationalGateway({
      stateFilePath,
      adminKey: "service-secret",
      adminPrincipal: principal(
        "tenant_001",
        "service_001",
        "service",
        ["model:read", "model:write"],
      ),
    });
    const serviceChange = await servicePrincipal.app.handleRequest(
      request(
        "service-secret",
        "POST",
        "/v1/global-trust/models/model_support_v1/status",
        {
          status: "suspended",
          reasonCode: "automated_change",
          correlationId: "corr_service",
        },
        { "x-operation-confirmation": "IGOR_APROVA_EXECUCAO" },
      ),
    );
    assert.equal(serviceChange.status, 403);
    assert.equal(
      JSON.parse(serviceChange.body).error,
      "human_operator_required",
    );

    const reader = createModelRegisteredOperationalGateway({
      stateFilePath,
      adminKey: "reader-secret",
      adminPrincipal: principal(
        "tenant_001",
        "reader_001",
        "human",
        ["model:read"],
      ),
    });
    const readerWrite = await reader.app.handleRequest(
      request(
        "reader-secret",
        "POST",
        "/v1/global-trust/models/model_support_v1/status",
        {
          status: "suspended",
          reasonCode: "missing_scope",
          correlationId: "corr_reader",
        },
        { "x-operation-confirmation": "IGOR_APROVA_EXECUCAO" },
      ),
    );
    assert.equal(readerWrite.status, 403);
    assert.deepEqual(
      JSON.parse(readerWrite.body).authorizationDecision.reasonCodes,
      ["missing_scope:model:write"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
