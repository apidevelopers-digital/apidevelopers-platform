import test from "node:test";
import assert from "node:assert/strict";

import {
  createZuniMasterInstitutionalPilotPlan,
  zuniMasterInstitutionalPilotConstants,
} from "../src/zuni-master-institutional-pilot.mjs";

test("builds Zuni Master institutional pilot as assisted activation without live charge", () => {
  const plan = createZuniMasterInstitutionalPilotPlan({
    organizationId: "apd:component:organization:api-developers-digital",
    principalId: "principal-test",
    createdAt: "2026-08-11T19:45:00.000Z",
  });

  assert.equal(plan.billing.priceId, "zuni.master.month.br");
  assert.equal(plan.billing.monthlyAmount, 169000);
  assert.equal(plan.billing.liveChargeAuthorized, false);
  assert.equal(plan.billing.automaticCharge, false);

  assert.equal(plan.subscription.planId, "master");
  assert.equal(plan.subscription.status, "assisted_activation");
  assert.equal(plan.subscription.activatedAt, null);

  assert.equal(plan.entitlement.capability, "zuni.master");
  assert.equal(plan.entitlement.status, "pending");

  assert.equal(plan.accessGrant.status, "pending");
  assert.deepEqual(plan.accessGrant.grantedScopes, []);
  assert.equal(plan.activation.requiresExplicitProductionApproval, true);
  assert.equal(plan.activation.activateSubscription, false);
  assert.equal(plan.activation.activateEntitlement, false);
  assert.equal(plan.activation.activateAccessGrant, false);
});

test("requires resolved organization and principal identifiers", () => {
  assert.throws(
    () => createZuniMasterInstitutionalPilotPlan({ principalId: "p" }),
    /organizationId/,
  );
  assert.throws(
    () => createZuniMasterInstitutionalPilotPlan({
      organizationId: "apd:component:organization:api-developers-digital",
    }),
    /principalId/,
  );
});

test("exports the approved monthly commercial constants only", () => {
  assert.deepEqual(zuniMasterInstitutionalPilotConstants, {
    productId: "zuni",
    planId: "master",
    priceId: "zuni.master.month.br",
    currency: "BRL",
    monthlyAmount: 169000,
  });
});
