import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createDataPolicyRegisteredOperationalGateway,
} from "../src/operational-data-policy-registry-composition.mjs";

function principal(tenantId, id, kind, scopes) {
  return { id, tenantId, kind, scopes };
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

test("exposes controlled data policy endpoints without applying a policy", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "data-policy-registry-http-"),
  );
  const stateFilePath = join(directory, "state.json");

  try {
    const operator = createDataPolicyRegisteredOperationalGateway({
      stateFilePath,
      adminKey: "operator-secret",
      adminPrincipal: principal(
        "tenant_001",
        "operator_001",
        "human",
        [
          "model:read",
          "model:write",
          "datapolicy:read",
          "datapolicy:write",
        ],
      ),
    });

    const policyBody = {
      dataPolicyId: "policy_support_v1",
      ownerId: "team_security",
      purpose: "customer_support",
      allowedDataClasses: ["public", "pii"],
      allowedRegions: ["BR"],
      retentionDays: 30,
      promptPersistenceAllowed: false,
      responsePersistenceAllowed: false,
      providerTrainingAllowed: false,
      crossTenantSharingAllowed: false,
      redactionRequired: true,
      humanReviewRequiredForSensitiveData: true,
      reasonCode: "initial_registration",
      correlationId: "corr_policy_register",
    };

    const missingConfirmation = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/data-policies",
        policyBody,
      ),
    );
    assert.equal(missingConfirmation.status, 428);

    const injectedTenant = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/data-policies",
        { ...policyBody, tenantId: "tenant_other" },
        confirmation,
      ),
    );
    assert.equal(injectedTenant.status, 400);

    const registeredResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/data-policies",
        policyBody,
        confirmation,
      ),
    );
    assert.equal(registeredResponse.status, 201);
    const registered = JSON.parse(registeredResponse.body);
    assert.equal(registered.tenantId, "tenant_001");
    assert.equal(registered.event.descriptor.status, "draft");
    assert.equal(registered.policyApplied, false);
    assert.equal(registered.providerContacted, false);

    const approvedResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/data-policies/policy_support_v1/status",
        {
          status: "approved",
          reasonCode: "privacy_review_passed",
          correlationId: "corr_policy_approve",
        },
        confirmation,
      ),
    );
    assert.equal(approvedResponse.status, 200);
    const approved = JSON.parse(approvedResponse.body);
    assert.equal(approved.result.descriptor.status, "approved");
    assert.equal(approved.policyApplied, false);
    assert.equal(approved.providerContacted, false);

    const listResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "GET",
        "/v1/global-trust/data-policies?status=approved",
      ),
    );
    assert.equal(listResponse.status, 200);
    const list = JSON.parse(listResponse.body);
    assert.equal(list.count, 1);
    assert.equal(list.dataPolicies[0].tenantId, "tenant_001");
    assert.equal(
      JSON.stringify(list).includes("operator-secret"),
      false,
    );

    const historyResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "GET",
        "/v1/global-trust/data-policies/policy_support_v1/history",
      ),
    );
    assert.equal(historyResponse.status, 200);
    assert.equal(JSON.parse(historyResponse.body).count, 2);

    const integrityResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "GET",
        "/v1/global-trust/data-policies/integrity",
      ),
    );
    assert.equal(integrityResponse.status, 200);
    assert.equal(
      JSON.parse(integrityResponse.body).verification.valid,
      true,
    );

    const applyResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/data-policies/policy_support_v1/apply",
        {},
        confirmation,
      ),
    );
    assert.equal(applyResponse.status, 404);

    const otherTenant = createDataPolicyRegisteredOperationalGateway({
      stateFilePath,
      adminKey: "other-secret",
      adminPrincipal: principal(
        "tenant_other",
        "operator_other",
        "human",
        ["datapolicy:read", "datapolicy:write"],
      ),
    });
    const otherListResponse = await otherTenant.app.handleRequest(
      request(
        "other-secret",
        "GET",
        "/v1/global-trust/data-policies",
      ),
    );
    assert.equal(otherListResponse.status, 200);
    const otherList = JSON.parse(otherListResponse.body);
    assert.equal(otherList.count, 0);
    assert.deepEqual(otherList.dataPolicies, []);
    assert.equal(
      JSON.stringify(otherList).includes("tenant_001"),
      false,
    );

    const service = createDataPolicyRegisteredOperationalGateway({
      stateFilePath,
      adminKey: "service-secret",
      adminPrincipal: principal(
        "tenant_001",
        "service_001",
        "service",
        ["datapolicy:read", "datapolicy:write"],
      ),
    });
    const serviceWrite = await service.app.handleRequest(
      request(
        "service-secret",
        "POST",
        "/v1/global-trust/data-policies/policy_support_v1/status",
        {
          status: "suspended",
          reasonCode: "automated_change",
          correlationId: "corr_service",
        },
        confirmation,
      ),
    );
    assert.equal(serviceWrite.status, 403);
    assert.equal(
      JSON.parse(serviceWrite.body).error,
      "human_operator_required",
    );

    const reader = createDataPolicyRegisteredOperationalGateway({
      stateFilePath,
      adminKey: "reader-secret",
      adminPrincipal: principal(
        "tenant_001",
        "reader_001",
        "human",
        ["datapolicy:read"],
      ),
    });
    const readerWrite = await reader.app.handleRequest(
      request(
        "reader-secret",
        "POST",
        "/v1/global-trust/data-policies/policy_support_v1/status",
        {
          status: "suspended",
          reasonCode: "missing_scope",
          correlationId: "corr_reader",
        },
        confirmation,
      ),
    );
    assert.equal(readerWrite.status, 403);
    assert.deepEqual(
      JSON.parse(readerWrite.body).authorizationDecision.reasonCodes,
      ["missing_scope:datapolicy:write"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
