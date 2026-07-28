import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createDataPolicyRegisteredOperationalGateway,
} from "../src/operational-data-policy-registry-composition.mjs";

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
        "datapolicy:read",
        "datapolicy:write",
      ],
    },
  };
}

test("governs data policy lifecycle with tenant isolation and integrity", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "data-policy-registry-"),
  );

  try {
    const gateway = createDataPolicyRegisteredOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "operator-secret",
      adminPrincipal: {
        id: "operator_001",
        tenantId: "tenant_001",
        kind: "human",
        scopes: [
          "model:read",
          "model:write",
          "datapolicy:read",
          "datapolicy:write",
        ],
      },
      dataPolicyRegistryEventIdFactory: sequence("policy_event"),
      dataPolicyRegistryProofIdFactory: sequence("policy_proof"),
      dataPolicyRegistryNow: () => "2026-07-28T20:00:00.000Z",
      dataPolicyRegistryIntegrityNow: () =>
        "2026-07-28T20:00:00.000Z",
    });

    const registered = await gateway.dataPolicyRegistry.register({
      identity: identity("tenant_001"),
      dataPolicyId: "policy_support_v1",
      ownerId: "team_security",
      purpose: "customer_support",
      allowedDataClasses: ["public", "pii"],
      allowedRegions: ["BR"],
      retentionDays: 30,
      correlationId: "corr_policy_register",
    });

    assert.equal(registered.eventType, "registered");
    assert.equal(registered.descriptor.status, "draft");
    assert.equal(registered.descriptor.providerTrainingAllowed, false);
    assert.equal(registered.descriptor.crossTenantSharingAllowed, false);

    const approved = await gateway.dataPolicyRegistry.transition({
      identity: identity("tenant_001"),
      dataPolicyId: "policy_support_v1",
      status: "approved",
      reasonCode: "privacy_review_passed",
      correlationId: "corr_policy_approve",
    });
    assert.equal(approved.changed, true);
    assert.equal(approved.descriptor.status, "approved");

    const repeated = await gateway.dataPolicyRegistry.transition({
      identity: identity("tenant_001"),
      dataPolicyId: "policy_support_v1",
      status: "approved",
      reasonCode: "duplicate_request",
      correlationId: "corr_policy_repeat",
    });
    assert.equal(repeated.changed, false);

    await gateway.dataPolicyRegistry.register({
      identity: identity("tenant_other", "operator_other"),
      dataPolicyId: "policy_support_v1",
      ownerId: "team_other",
      purpose: "other_support",
      allowedDataClasses: ["public"],
      allowedRegions: ["US"],
      retentionDays: 7,
      correlationId: "corr_other",
    });

    const tenantPolicies = await gateway.dataPolicyRegistry.list({
      tenantId: "tenant_001",
    });
    assert.equal(tenantPolicies.length, 1);
    assert.equal(tenantPolicies[0].status, "approved");

    const otherPolicies = await gateway.dataPolicyRegistry.list({
      tenantId: "tenant_other",
    });
    assert.equal(otherPolicies.length, 1);
    assert.equal(
      JSON.stringify(otherPolicies).includes("tenant_001"),
      false,
    );

    await assert.rejects(
      gateway.dataPolicyRegistry.transition({
        identity: identity(
          "tenant_001",
          "service_001",
          "service",
        ),
        dataPolicyId: "policy_support_v1",
        status: "suspended",
        reasonCode: "automated_change",
        correlationId: "corr_service",
      }),
      (error) =>
        error.code === "human_operator_required"
        && error.status === 403,
    );

    const retired = await gateway.dataPolicyRegistry.transition({
      identity: identity("tenant_001"),
      dataPolicyId: "policy_support_v1",
      status: "retired",
      reasonCode: "superseded",
      correlationId: "corr_policy_retire",
    });
    assert.equal(retired.descriptor.status, "retired");

    await assert.rejects(
      gateway.dataPolicyRegistry.transition({
        identity: identity("tenant_001"),
        dataPolicyId: "policy_support_v1",
        status: "approved",
        reasonCode: "unsafe_reactivation",
        correlationId: "corr_policy_reactivate",
      }),
      (error) => error.code === "invalid_status_transition",
    );

    const history = await gateway.dataPolicyRegistry.history({
      tenantId: "tenant_001",
      dataPolicyId: "policy_support_v1",
    });
    assert.deepEqual(
      history.map((event) => event.descriptor.status),
      ["draft", "approved", "retired"],
    );

    const verification =
      await gateway.dataPolicyRegistryIntegrity.verifyTenant({
        tenantId: "tenant_001",
      });
    assert.equal(verification.valid, true);
    assert.equal(verification.proofCount, 3);
    assert.equal(verification.protectedRecordCount, 3);
    assert.equal(verification.sensitiveContentIncluded, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
