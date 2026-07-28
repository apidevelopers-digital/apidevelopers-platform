import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createGlobalTrustComposedOperationalGateway,
} from "../src/operational-global-trust-composition.mjs";

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
      [
        "admission:evaluate",
        "audit:read",
        "model:read",
        "model:write",
        "usecase:read",
        "usecase:write",
        "datapolicy:read",
        "datapolicy:write",
      ],
      kind,
    ),
  };
}

async function seedApprovedRegistries(gateway, tenantId = "tenant_001") {
  const operator = identity(tenantId);

  await gateway.dataPolicyRegistry.register({
    identity: operator,
    dataPolicyId: "policy_support_v1",
    ownerId: "owner_001",
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
    correlationId: "corr_policy_register",
  });
  await gateway.dataPolicyRegistry.transition({
    identity: operator,
    dataPolicyId: "policy_support_v1",
    status: "approved",
    reasonCode: "policy_review_passed",
    correlationId: "corr_policy_approve",
  });

  await gateway.modelRegistry.register({
    identity: operator,
    modelId: "model_support_v1",
    provider: "provider_a",
    model: "safe-model",
    version: "2026-07-01",
    purpose: "customer_support",
    dataPolicyId: "policy_support_v1",
    allowedLocales: ["pt-BR"],
    correlationId: "corr_model_register",
  });
  await gateway.modelRegistry.transition({
    identity: operator,
    modelId: "model_support_v1",
    status: "approved",
    reasonCode: "model_review_passed",
    correlationId: "corr_model_approve",
  });

  await gateway.useCaseRegistry.register({
    identity: operator,
    useCaseId: "usecase_support_v1",
    ownerId: "owner_001",
    purpose: "customer_support",
    dataPolicyId: "policy_support_v1",
    riskLevel: "moderate",
    allowedModelIds: ["model_support_v1"],
    allowedToolIds: ["crm.read"],
    allowedLocales: ["pt-BR"],
    humanApprovalRequired: false,
    correlationId: "corr_usecase_register",
  });
  await gateway.useCaseRegistry.transition({
    identity: operator,
    useCaseId: "usecase_support_v1",
    status: "approved",
    reasonCode: "use_case_review_passed",
    correlationId: "corr_usecase_approve",
  });
}

function gatewayOptions(stateFilePath) {
  return {
    stateFilePath,
    adminKey: "operator-key",
    adminPrincipal: principal(
      "tenant_001",
      "operator_001",
      ["admission:evaluate", "audit:read"],
    ),
    admissionDecisionIdFactory: sequence("admission"),
    admissionProofIdFactory: sequence("proof"),
    admissionNow: () => "2026-07-28T21:00:00.000Z",
    admissionIntegrityNow: () => "2026-07-28T21:00:01.000Z",
  };
}

function request(method, url, body, headers = {}) {
  return {
    method,
    url,
    headers: {
      "x-api-key": "operator-key",
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

test("cross-validates approved registries without execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "admission-gate-"));
  const stateFilePath = join(directory, "state.json");

  try {
    const gateway = createGlobalTrustComposedOperationalGateway(
      gatewayOptions(stateFilePath),
    );
    await seedApprovedRegistries(gateway);

    const allowed = await gateway.admissionGate.evaluate({
      identity: identity("tenant_001", "service"),
      modelId: "model_support_v1",
      useCaseId: "usecase_support_v1",
      dataPolicyId: "policy_support_v1",
      locale: "pt-BR",
      toolIds: ["crm.read"],
      dataClasses: ["pii"],
      region: "BR",
      sensitiveData: false,
      correlationId: "corr_allow",
    });
    assert.equal(allowed.outcome, "allow");
    assert.equal(allowed.admitted, true);
    assert.deepEqual(allowed.reasonCodes, ["registry_constraints_satisfied"]);
    assert.equal(allowed.modelExecuted, false);
    assert.equal(allowed.toolExecuted, false);
    assert.equal(allowed.providerContacted, false);

    const review = await gateway.admissionGate.evaluate({
      identity: identity("tenant_001", "service"),
      modelId: "model_support_v1",
      useCaseId: "usecase_support_v1",
      dataPolicyId: "policy_support_v1",
      locale: "pt-BR",
      toolIds: [],
      dataClasses: ["pii"],
      region: "BR",
      sensitiveData: true,
      correlationId: "corr_review",
    });
    assert.equal(review.outcome, "review");
    assert.equal(review.humanReviewRequired, true);
    assert.deepEqual(review.reasonCodes, [
      "sensitive_data_human_review_required",
    ]);

    const denied = await gateway.admissionGate.evaluate({
      identity: identity("tenant_001", "service"),
      modelId: "model_support_v1",
      useCaseId: "usecase_support_v1",
      dataPolicyId: "policy_other",
      locale: "en-US",
      toolIds: ["admin.delete"],
      dataClasses: ["confidential"],
      region: "US",
      sensitiveData: false,
      correlationId: "corr_deny",
    });
    assert.equal(denied.outcome, "deny");
    assert.equal(denied.admitted, false);
    for (const code of [
      "data_policy_not_registered",
      "model_data_policy_mismatch",
      "use_case_data_policy_mismatch",
      "locale_not_allowed_by_model",
      "tool_not_allowed_for_use_case",
    ]) {
      assert.ok(denied.reasonCodes.includes(code), `missing ${code}`);
    }

    assert.equal(
      (await gateway.admissionGate.listTenant({
        tenantId: "tenant_other",
      })).length,
      0,
    );

    const verification = await gateway.admissionIntegrity.verifyTenant({
      tenantId: "tenant_001",
    });
    assert.equal(verification.valid, true);
    assert.equal(verification.protectedRecordCount, 3);
    assert.equal(verification.proofCount, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("HTTP admission is confirmed, tenant-bound and has no inference route", async () => {
  const directory = await mkdtemp(join(tmpdir(), "admission-http-"));
  const stateFilePath = join(directory, "state.json");

  try {
    const gateway = createGlobalTrustComposedOperationalGateway(
      gatewayOptions(stateFilePath),
    );
    await seedApprovedRegistries(gateway);

    const body = {
      modelId: "model_support_v1",
      useCaseId: "usecase_support_v1",
      dataPolicyId: "policy_support_v1",
      locale: "pt-BR",
      toolIds: [],
      dataClasses: ["public"],
      region: "BR",
      sensitiveData: false,
    };

    const missing = await gateway.app.handleRequest(
      request("POST", "/v1/global-trust/admission/evaluate", body),
    );
    assert.equal(missing.status, 428);

    const injected = await gateway.app.handleRequest(
      request(
        "POST",
        "/v1/global-trust/admission/evaluate",
        { ...body, tenantId: "tenant_other" },
        confirmation,
      ),
    );
    assert.equal(injected.status, 400);

    const evaluated = await gateway.app.handleRequest(
      request(
        "POST",
        "/v1/global-trust/admission/evaluate",
        body,
        confirmation,
      ),
    );
    assert.equal(evaluated.status, 201);
    const evaluationPayload = JSON.parse(evaluated.body);
    assert.equal(evaluationPayload.decision.outcome, "allow");
    assert.equal(evaluationPayload.inferenceExecuted, false);
    assert.equal(evaluationPayload.modelExecuted, false);

    const listed = await gateway.app.handleRequest(
      request("GET", "/v1/global-trust/admission/decisions"),
    );
    assert.equal(listed.status, 200);
    assert.equal(JSON.parse(listed.body).count, 1);

    const integrity = await gateway.app.handleRequest(
      request("GET", "/v1/global-trust/admission/integrity"),
    );
    assert.equal(integrity.status, 200);
    assert.equal(JSON.parse(integrity.body).verification.valid, true);

    const inference = await gateway.app.handleRequest(
      request("POST", "/v1/global-trust/inference", {}),
    );
    assert.equal(inference.status, 404);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
