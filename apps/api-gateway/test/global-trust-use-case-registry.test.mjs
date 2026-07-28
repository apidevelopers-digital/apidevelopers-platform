import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createUseCaseRegisteredOperationalGateway,
} from "../src/operational-use-case-registry-composition.mjs";

function sequence(prefix) {
  let value = 0;
  return () => `${prefix}_${String(++value).padStart(3, "0")}`;
}

function identity(
  tenantId,
  id = "operator_001",
  kind = "human",
) {
  return {
    principal: {
      id,
      tenantId,
      kind,
      scopes: [
        "model:read",
        "model:write",
        "usecase:read",
        "usecase:write",
      ],
    },
  };
}

async function registerApprovedModel(gateway, tenantId, modelId) {
  await gateway.modelRegistry.register({
    identity: identity(tenantId),
    modelId,
    provider: "provider_a",
    model: "safe-model",
    version: "2026-07-01",
    purpose: "customer_support",
    dataPolicyId: "policy_support_v1",
    allowedLocales: ["pt-BR", "en-US"],
    correlationId: `corr_model_register_${modelId}`,
  });
  await gateway.modelRegistry.transition({
    identity: identity(tenantId),
    modelId,
    status: "approved",
    reasonCode: "evaluation_passed",
    correlationId: `corr_model_approve_${modelId}`,
  });
}

test("registers approved use cases with tenant isolation and integrity", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "use-case-registry-"),
  );

  try {
    const gateway = createUseCaseRegisteredOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "operator-secret",
      adminPrincipal: {
        id: "operator_001",
        tenantId: "tenant_001",
        kind: "human",
        scopes: [
          "model:read",
          "model:write",
          "usecase:read",
          "usecase:write",
        ],
      },
      modelRegistryEventIdFactory: sequence("model_event"),
      modelRegistryProofIdFactory: sequence("model_proof"),
      modelRegistryNow: () => "2026-07-28T18:00:00.000Z",
      modelRegistryIntegrityNow: () => "2026-07-28T18:00:00.000Z",
      useCaseRegistryEventIdFactory: sequence("use_case_event"),
      useCaseRegistryProofIdFactory: sequence("use_case_proof"),
      useCaseRegistryNow: () => "2026-07-28T18:01:00.000Z",
      useCaseRegistryIntegrityNow: () =>
        "2026-07-28T18:01:00.000Z",
    });

    await registerApprovedModel(
      gateway,
      "tenant_001",
      "model_support_v1",
    );

    const registered = await gateway.useCaseRegistry.register({
      identity: identity("tenant_001"),
      useCaseId: "use_case_support_v1",
      ownerId: "team_support",
      purpose: "customer_support",
      dataPolicyId: "policy_support_v1",
      riskLevel: "moderate",
      allowedModelIds: ["model_support_v1", "model_support_v1"],
      allowedToolIds: ["catalog.read"],
      allowedLocales: ["pt-BR", "en-US"],
      humanApprovalRequired: true,
      correlationId: "corr_use_case_register",
    });

    assert.equal(registered.eventType, "registered");
    assert.equal(registered.descriptor.status, "draft");
    assert.deepEqual(
      registered.descriptor.allowedModelIds,
      ["model_support_v1"],
    );
    assert.equal(
      registered.descriptor.automaticExecutionAllowed,
      false,
    );
    assert.equal(registered.modelApprovalSnapshot.length, 0);

    await assert.rejects(
      gateway.useCaseRegistry.register({
        identity: identity("tenant_001"),
        useCaseId: "use_case_support_v1",
        ownerId: "team_support",
        purpose: "customer_support",
        dataPolicyId: "policy_support_v1",
        riskLevel: "moderate",
        allowedModelIds: ["model_support_v1"],
        allowedLocales: ["pt-BR"],
        correlationId: "corr_duplicate",
      }),
      (error) =>
        error.code === "use_case_already_registered"
        && error.status === 409,
    );

    const approved = await gateway.useCaseRegistry.transition({
      identity: identity("tenant_001"),
      useCaseId: "use_case_support_v1",
      status: "approved",
      reasonCode: "governance_review_passed",
      correlationId: "corr_use_case_approve",
    });

    assert.equal(approved.changed, true);
    assert.equal(approved.descriptor.status, "approved");
    assert.deepEqual(
      approved.event.modelApprovalSnapshot.map((item) => item.modelId),
      ["model_support_v1"],
    );

    const repeated = await gateway.useCaseRegistry.transition({
      identity: identity("tenant_001"),
      useCaseId: "use_case_support_v1",
      status: "approved",
      reasonCode: "duplicate_request",
      correlationId: "corr_use_case_repeat",
    });
    assert.equal(repeated.changed, false);
    assert.equal(repeated.event.revision, 2);

    await gateway.useCaseRegistry.register({
      identity: identity("tenant_other", "operator_other"),
      useCaseId: "use_case_support_v1",
      ownerId: "team_other",
      purpose: "other_support",
      dataPolicyId: "policy_other_v1",
      riskLevel: "low",
      allowedModelIds: ["model_support_v1"],
      allowedLocales: ["es-ES"],
      correlationId: "corr_other",
    });

    const tenantUseCases = await gateway.useCaseRegistry.list({
      tenantId: "tenant_001",
    });
    assert.equal(tenantUseCases.length, 1);
    assert.equal(tenantUseCases[0].status, "approved");

    const otherUseCases = await gateway.useCaseRegistry.list({
      tenantId: "tenant_other",
    });
    assert.equal(otherUseCases.length, 1);
    assert.equal(
      JSON.stringify(otherUseCases).includes("tenant_001"),
      false,
    );

    await gateway.modelRegistry.transition({
      identity: identity("tenant_001"),
      modelId: "model_support_v1",
      status: "suspended",
      reasonCode: "safety_review",
      correlationId: "corr_model_suspend",
    });

    await gateway.useCaseRegistry.register({
      identity: identity("tenant_001"),
      useCaseId: "use_case_support_v2",
      ownerId: "team_support",
      purpose: "customer_support_v2",
      dataPolicyId: "policy_support_v1",
      riskLevel: "high",
      allowedModelIds: ["model_support_v1"],
      allowedLocales: ["pt-BR"],
      correlationId: "corr_use_case_v2",
    });

    await assert.rejects(
      gateway.useCaseRegistry.transition({
        identity: identity("tenant_001"),
        useCaseId: "use_case_support_v2",
        status: "approved",
        reasonCode: "unsafe_attempt",
        correlationId: "corr_use_case_v2_approve",
      }),
      (error) =>
        error.code === "model_not_approved"
        && error.status === 409,
    );

    const retired = await gateway.useCaseRegistry.transition({
      identity: identity("tenant_001"),
      useCaseId: "use_case_support_v1",
      status: "retired",
      reasonCode: "superseded",
      correlationId: "corr_use_case_retire",
    });
    assert.equal(retired.descriptor.status, "retired");

    await assert.rejects(
      gateway.useCaseRegistry.transition({
        identity: identity("tenant_001"),
        useCaseId: "use_case_support_v1",
        status: "approved",
        reasonCode: "unsafe_reactivation",
        correlationId: "corr_use_case_reactivate",
      }),
      (error) => error.code === "invalid_status_transition",
    );

    await assert.rejects(
      gateway.useCaseRegistry.transition({
        identity: identity(
          "tenant_001",
          "service_001",
          "service",
        ),
        useCaseId: "use_case_support_v2",
        status: "suspended",
        reasonCode: "automated_change",
        correlationId: "corr_service",
      }),
      (error) =>
        error.code === "human_operator_required"
        && error.status === 403,
    );

    const history = await gateway.useCaseRegistry.history({
      tenantId: "tenant_001",
      useCaseId: "use_case_support_v1",
    });
    assert.deepEqual(
      history.map((event) => event.descriptor.status),
      ["draft", "approved", "retired"],
    );

    const verification =
      await gateway.useCaseRegistryIntegrity.verifyTenant({
        tenantId: "tenant_001",
      });
    assert.equal(verification.valid, true);
    assert.equal(verification.proofCount, 4);
    assert.equal(verification.protectedRecordCount, 4);
    assert.equal(verification.sensitiveContentIncluded, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
