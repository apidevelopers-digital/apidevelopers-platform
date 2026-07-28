import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDataPolicyDescriptorContract,
  createDataPolicyDescriptor,
} from "../src/global-trust-data-policy.mjs";

test("creates a safe data policy descriptor", () => {
  const descriptor = createDataPolicyDescriptor({
    dataPolicyId: "policy_support_v1",
    tenantId: "tenant_001",
    ownerId: "team_security",
    purpose: "customer_support",
    allowedDataClasses: ["public", "pii", "pii"],
    allowedRegions: ["BR", "US", "BR"],
    retentionDays: 30,
  });

  assert.equal(descriptor.status, "draft");
  assert.deepEqual(descriptor.allowedDataClasses, ["pii", "public"]);
  assert.deepEqual(descriptor.allowedRegions, ["BR", "US"]);
  assert.equal(descriptor.providerTrainingAllowed, false);
  assert.equal(descriptor.crossTenantSharingAllowed, false);
  assert.equal(descriptor.redactionRequired, true);
  assert.equal(descriptor.secretMaterialIncluded, false);
  assert.equal(
    assertDataPolicyDescriptorContract(descriptor),
    descriptor,
  );
});

test("rejects unsafe sensitive-data and retention configurations", () => {
  assert.throws(() => createDataPolicyDescriptor({
    dataPolicyId: "policy_invalid",
    tenantId: "tenant_001",
    ownerId: "team_security",
    purpose: "customer_support",
    allowedDataClasses: ["pii"],
    allowedRegions: ["BR"],
    retentionDays: 30,
    redactionRequired: false,
  }));

  assert.throws(() => createDataPolicyDescriptor({
    dataPolicyId: "policy_invalid",
    tenantId: "tenant_001",
    ownerId: "team_security",
    purpose: "customer_support",
    allowedDataClasses: ["public"],
    allowedRegions: ["BR"],
    retentionDays: 3651,
  }));

  const descriptor = createDataPolicyDescriptor({
    dataPolicyId: "policy_safe",
    tenantId: "tenant_001",
    ownerId: "team_security",
    purpose: "customer_support",
    allowedDataClasses: ["public"],
    allowedRegions: ["BR"],
    retentionDays: 30,
  });

  assert.throws(() => assertDataPolicyDescriptorContract({
    ...descriptor,
    providerTrainingAllowed: true,
  }));
});
