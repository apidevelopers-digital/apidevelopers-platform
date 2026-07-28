import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createOutputValidatedOperationalGateway,
} from "../src/operational-output-validator-composition.mjs";

function sequence(prefix) {
  let value = 0;
  return () => `${prefix}_${String(++value).padStart(3, "0")}`;
}

function principal(tenantId, id, scopes, kind = "human") {
  return { id, tenantId, kind, scopes };
}

function identity(tenantId) {
  return {
    principal: principal(
      tenantId,
      "operator_001",
      ["outputvalidator:evaluate", "audit:read"],
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

test("validates outputs without persisting raw content", async () => {
  const directory = await mkdtemp(join(tmpdir(), "output-validator-"));
  const stateFilePath = join(directory, "state.json");

  try {
    const gateway = createOutputValidatedOperationalGateway({
      stateFilePath,
      adminKey: "operator-secret",
      adminPrincipal: principal(
        "tenant_001",
        "operator_001",
        ["outputvalidator:evaluate", "audit:read"],
      ),
      outputValidatorDecisionIdFactory: sequence("output_decision"),
      outputValidatorProofIdFactory: sequence("output_proof"),
      outputValidatorNow: () => "2026-07-28T23:00:00.000Z",
      outputValidatorIntegrityNow: () => "2026-07-28T23:00:00.000Z",
    });

    const benignOutput =
      "The approved customer support policy allows a response within 24 hours.";
    const benign = await gateway.outputValidator.evaluate({
      identity: identity("tenant_001"),
      output: benignOutput,
      sourceType: "model_output",
      useCaseId: "use_case_support_v1",
      dataPolicyId: "policy_support_v1",
      modelId: "model_support_v1",
      correlationId: "corr_benign",
    });
    assert.equal(benign.outcome, "allow");
    assert.equal(benign.riskLevel, "low");
    assert.equal(benign.outputPersisted, false);
    assert.equal(benign.modelExecuted, false);

    const personalOutput = "Contact ana@example.com or 1199999-8888.";
    const personal = await gateway.outputValidator.evaluate({
      identity: identity("tenant_001"),
      output: personalOutput,
      sourceType: "model_output",
      useCaseId: "use_case_support_v1",
      dataPolicyId: "policy_support_v1",
      modelId: "model_support_v1",
      correlationId: "corr_personal",
    });
    assert.equal(personal.outcome, "review");
    assert.equal(personal.riskLevel, "moderate");
    assert.equal(personal.reasonCodes.includes("personal_data_detected"), true);

    const secretOutput = "api_key=sk_live_1234567890abcdefghijkl";
    const secret = await gateway.outputValidator.evaluate({
      identity: identity("tenant_001"),
      output: secretOutput,
      sourceType: "tool_output",
      useCaseId: "use_case_support_v1",
      dataPolicyId: "policy_support_v1",
      correlationId: "corr_secret",
    });
    assert.equal(secret.outcome, "deny");
    assert.equal(secret.riskLevel, "critical");
    assert.equal(secret.reasonCodes.includes("secret_material_detected"), true);

    const decisions = await gateway.outputValidator.listTenant({
      tenantId: "tenant_001",
    });
    assert.equal(decisions.length, 3);
    assert.equal(
      (await gateway.outputValidator.listTenant({
        tenantId: "tenant_other",
      })).length,
      0,
    );

    const verification =
      await gateway.outputValidatorIntegrity.verifyTenant({
        tenantId: "tenant_001",
      });
    assert.equal(verification.valid, true);
    assert.equal(verification.proofCount, 3);
    assert.equal(verification.protectedRecordCount, 3);

    const persisted = await readFile(stateFilePath, "utf8");
    assert.equal(persisted.includes(benignOutput), false);
    assert.equal(persisted.includes(personalOutput), false);
    assert.equal(persisted.includes(secretOutput), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("protects output validator HTTP evaluation and tenant history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "output-validator-http-"));
  const stateFilePath = join(directory, "state.json");

  try {
    const operator = createOutputValidatedOperationalGateway({
      stateFilePath,
      adminKey: "operator-secret",
      adminPrincipal: principal(
        "tenant_001",
        "operator_001",
        ["outputvalidator:evaluate", "audit:read"],
      ),
      outputValidatorDecisionIdFactory: sequence("http_decision"),
      outputValidatorProofIdFactory: sequence("http_proof"),
    });

    const body = {
      output: "The approved customer support policy allows a 24 hour response.",
      sourceType: "model_output",
      useCaseId: "use_case_support_v1",
      dataPolicyId: "policy_support_v1",
      modelId: "model_support_v1",
      correlationId: "corr_output_allow",
    };

    const missingConfirmation = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/output-validator/evaluate",
        body,
      ),
    );
    assert.equal(missingConfirmation.status, 428);

    const injectedTenant = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/output-validator/evaluate",
        { ...body, tenantId: "tenant_other" },
        confirmation,
      ),
    );
    assert.equal(injectedTenant.status, 400);

    const allowedResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/output-validator/evaluate",
        body,
        confirmation,
      ),
    );
    assert.equal(allowedResponse.status, 200);
    const allowed = JSON.parse(allowedResponse.body);
    assert.equal(allowed.decision.outcome, "allow");
    assert.equal(allowed.outputPersisted, false);

    const deniedResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/output-validator/evaluate",
        {
          ...body,
          output: "<script>fetch('javascript:steal')</script>",
          correlationId: "corr_output_deny",
        },
        confirmation,
      ),
    );
    assert.equal(deniedResponse.status, 403);
    assert.equal(JSON.parse(deniedResponse.body).decision.outcome, "deny");

    const listResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "GET",
        "/v1/global-trust/output-validator/decisions",
      ),
    );
    assert.equal(listResponse.status, 200);
    const list = JSON.parse(listResponse.body);
    assert.equal(list.count, 2);
    assert.equal(
      list.decisions.every((decision) => decision.tenantId === "tenant_001"),
      true,
    );
    assert.equal(JSON.stringify(list).includes(body.output), false);

    const integrityResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "GET",
        "/v1/global-trust/output-validator/integrity",
      ),
    );
    assert.equal(integrityResponse.status, 200);
    assert.equal(JSON.parse(integrityResponse.body).verification.valid, true);

    const otherTenant = createOutputValidatedOperationalGateway({
      stateFilePath,
      adminKey: "other-secret",
      adminPrincipal: principal(
        "tenant_other",
        "operator_other",
        ["outputvalidator:evaluate", "audit:read"],
      ),
    });
    const otherList = JSON.parse(
      (await otherTenant.app.handleRequest(
        request(
          "other-secret",
          "GET",
          "/v1/global-trust/output-validator/decisions",
        ),
      )).body,
    );
    assert.equal(otherList.count, 0);

    const reader = createOutputValidatedOperationalGateway({
      stateFilePath,
      adminKey: "reader-secret",
      adminPrincipal: principal(
        "tenant_001",
        "reader_001",
        ["audit:read"],
      ),
    });
    const forbidden = await reader.app.handleRequest(
      request(
        "reader-secret",
        "POST",
        "/v1/global-trust/output-validator/evaluate",
        body,
        confirmation,
      ),
    );
    assert.equal(forbidden.status, 403);
    assert.deepEqual(
      JSON.parse(forbidden.body).authorizationDecision.reasonCodes,
      ["missing_scope:outputvalidator:evaluate"],
    );

    const executeResponse = await operator.app.handleRequest(
      request(
        "operator-secret",
        "POST",
        "/v1/global-trust/output-validator/execute",
        {},
        confirmation,
      ),
    );
    assert.equal(executeResponse.status, 404);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
