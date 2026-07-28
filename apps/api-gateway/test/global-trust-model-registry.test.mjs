import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";

import {
  MODEL_REGISTRY_EVENT_COLLECTION,
  createGlobalTrustModelRegistry,
} from "../src/global-trust-model-registry.mjs";
import { createGlobalTrustModelRegistryIntegrity } from "../src/global-trust-model-registry-integrity.mjs";

function sequence(prefix) {
  let value = 0;
  return () => `${prefix}_${String(++value).padStart(3, "0")}`;
}

function identity(tenantId, id = "operator_001", kind = "human") {
  return {
    principal: {
      id,
      tenantId,
      kind,
      scopes: ["model:read", "model:write"],
    },
  };
}

test("registers immutable tenant models, enforces lifecycle, and verifies integrity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "model-registry-"));
  try {
    const store = createJsonFileStore({
      filePath: join(directory, "state.json"),
    });
    const integrity = createGlobalTrustModelRegistryIntegrity({
      store,
      proofIdFactory: sequence("proof"),
      now: () => "2026-07-28T16:00:00.000Z",
    });
    const registry = createGlobalTrustModelRegistry({
      store,
      integrity,
      eventIdFactory: sequence("event"),
      now: () => "2026-07-28T16:01:00.000Z",
    });

    const registered = await registry.register({
      identity: identity("tenant_001"),
      modelId: "model_customer_support_v1",
      provider: "provider_a",
      model: "safe-model",
      version: "2026-07-01",
      purpose: "customer_support",
      dataPolicyId: "policy_customer_support_v1",
      allowedLocales: ["pt-BR", "en-US", "pt-BR"],
      correlationId: "corr_register",
    });

    assert.equal(registered.eventType, "registered");
    assert.equal(registered.descriptor.status, "candidate");
    assert.deepEqual(registered.descriptor.allowedLocales, ["en-US", "pt-BR"]);
    assert.equal(registered.descriptor.secretMaterialIncluded, false);
    assert.equal(registered.sensitiveContentIncluded, false);

    await assert.rejects(
      registry.register({
        identity: identity("tenant_001"),
        modelId: "model_customer_support_v1",
        provider: "provider_a",
        model: "safe-model",
        version: "2026-07-01",
        purpose: "customer_support",
        dataPolicyId: "policy_customer_support_v1",
        allowedLocales: ["pt-BR"],
        correlationId: "corr_duplicate",
      }),
      (error) => error.code === "model_already_registered" && error.status === 409,
    );

    const approved = await registry.transition({
      identity: identity("tenant_001"),
      modelId: "model_customer_support_v1",
      status: "approved",
      reasonCode: "evaluation_passed",
      correlationId: "corr_approve",
    });
    assert.equal(approved.changed, true);
    assert.equal(approved.descriptor.status, "approved");
    assert.equal(approved.event.revision, 2);

    const repeated = await registry.transition({
      identity: identity("tenant_001"),
      modelId: "model_customer_support_v1",
      status: "approved",
      reasonCode: "duplicate_request",
      correlationId: "corr_repeat",
    });
    assert.equal(repeated.changed, false);
    assert.equal(repeated.event.revision, 2);

    await registry.register({
      identity: identity("tenant_other", "operator_other"),
      modelId: "model_customer_support_v1",
      provider: "provider_b",
      model: "other-model",
      version: "1",
      purpose: "other",
      dataPolicyId: "policy_other_v1",
      allowedLocales: ["es-ES"],
      correlationId: "corr_other",
    });

    const tenantModels = await registry.list({ tenantId: "tenant_001" });
    assert.equal(tenantModels.length, 1);
    assert.equal(tenantModels[0].provider, "provider_a");

    const otherModels = await registry.list({ tenantId: "tenant_other" });
    assert.equal(otherModels.length, 1);
    assert.equal(otherModels[0].provider, "provider_b");
    assert.equal(JSON.stringify(otherModels).includes("tenant_001"), false);

    const retired = await registry.transition({
      identity: identity("tenant_001"),
      modelId: "model_customer_support_v1",
      status: "retired",
      reasonCode: "superseded",
      correlationId: "corr_retire",
    });
    assert.equal(retired.descriptor.status, "retired");

    await assert.rejects(
      registry.transition({
        identity: identity("tenant_001"),
        modelId: "model_customer_support_v1",
        status: "approved",
        reasonCode: "unsafe_reactivation",
        correlationId: "corr_invalid",
      }),
      (error) => error.code === "invalid_status_transition",
    );

    await assert.rejects(
      registry.transition({
        identity: identity("tenant_001", "service_001", "service"),
        modelId: "model_customer_support_v1",
        status: "suspended",
        reasonCode: "automated_change",
        correlationId: "corr_service",
      }),
      (error) => error.code === "human_operator_required" && error.status === 403,
    );

    const history = await registry.history({
      tenantId: "tenant_001",
      modelId: "model_customer_support_v1",
    });
    assert.equal(history.length, 3);
    assert.deepEqual(history.map((event) => event.descriptor.status), [
      "candidate",
      "approved",
      "retired",
    ]);

    const verification = await integrity.verifyTenant({ tenantId: "tenant_001" });
    assert.equal(verification.valid, true);
    assert.equal(verification.proofCount, 3);
    assert.equal(verification.protectedRecordCount, 3);

    const storedEvents = await store.transaction((tx) =>
      tx.list(MODEL_REGISTRY_EVENT_COLLECTION)
    );
    assert.equal(storedEvents.result.length, 4);
    assert.equal(
      storedEvents.result.every(({ value }) =>
        value.sensitiveContentIncluded === false
        && value.descriptor?.secretMaterialIncluded === false
      ),
      true,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
