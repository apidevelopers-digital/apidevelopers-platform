import assert from "node:assert/strict";
import test from "node:test";

import {
  assertUseCaseDescriptorContract,
  createUseCaseDescriptor,
} from "../src/global-trust-use-case.mjs";

test("creates a safe use case descriptor", () => {
  const descriptor = createUseCaseDescriptor({
    useCaseId: "use_case_support_v1",
    tenantId: "tenant_001",
    ownerId: "team_support",
    purpose: "customer_support",
    dataPolicyId: "policy_support_v1",
    riskLevel: "moderate",
    allowedModelIds: ["model_support_v1", "model_support_v1"],
    allowedToolIds: ["catalog.read"],
    allowedLocales: ["pt-BR", "en-US"],
    humanApprovalRequired: true,
  });

  assert.equal(descriptor.status, "draft");
  assert.deepEqual(descriptor.allowedModelIds, ["model_support_v1"]);
  assert.equal(descriptor.secretMaterialIncluded, false);
  assert.equal(descriptor.executablePayloadIncluded, false);
  assert.equal(descriptor.automaticExecutionAllowed, false);
  assert.equal(assertUseCaseDescriptorContract(descriptor), descriptor);
});

test("rejects automatic execution and empty model allowlists", () => {
  assert.throws(
    () => createUseCaseDescriptor({
      useCaseId: "use_case_invalid",
      tenantId: "tenant_001",
      ownerId: "team_support",
      purpose: "customer_support",
      dataPolicyId: "policy_support_v1",
      riskLevel: "low",
      allowedModelIds: [],
      allowedLocales: ["pt-BR"],
    }),
  );

  const descriptor = createUseCaseDescriptor({
    useCaseId: "use_case_support_v1",
    tenantId: "tenant_001",
    ownerId: "team_support",
    purpose: "customer_support",
    dataPolicyId: "policy_support_v1",
    riskLevel: "low",
    allowedModelIds: ["model_support_v1"],
    allowedLocales: ["pt-BR"],
  });

  assert.throws(() => assertUseCaseDescriptorContract({
    ...descriptor,
    automaticExecutionAllowed: true,
  }));
});
