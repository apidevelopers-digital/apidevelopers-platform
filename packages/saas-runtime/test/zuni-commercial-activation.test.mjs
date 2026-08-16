import test from "node:test";
import assert from "node:assert/strict";
import { createCanonicalId } from "../../contracts/src/canonical-ids.mjs";
import {
  createZuniActivationPlan,
  validateZuniCommercialPlanSnapshot,
} from "../src/zuni-commercial-activation.mjs";

const organizationId = createCanonicalId({
  family: "component",
  segments: ["organization", "acme"],
});

const start = {
  id: "start",
  product_id: "zuni",
  commercial_state: "early_access",
  pricing_status: "published",
  sellable: true,
  pricing: { monthly_cents: 29700 },
  limits: { whatsapp_channels: 1, users: 3 },
  capabilities: {
    inbox: "included",
    contacts: "included",
    templates: "included",
    uni_co: "basic",
    support: "standard",
  },
};

test("validates published sellable Zuni plan snapshot", () => {
  const result = validateZuniCommercialPlanSnapshot(start);
  assert.equal(result.productId, "zuni");
  assert.equal(result.planId, "start");
  assert.equal(result.monthlyAmount, 297);
  assert.equal(result.monthlyAmountCents, 29700);
  assert.ok(result.capabilities.some((entry) => entry.capability === "limit-users" && entry.value === 3));
});

test("rejects Master preview/proposal and other non-sellable plans", () => {
  assert.throws(
    () => validateZuniCommercialPlanSnapshot({
      ...start,
      id: "master",
      commercial_state: "preview",
      pricing_status: "proposal",
      sellable: false,
      pricing: { monthly_cents: 169000 },
    }),
    /not commercially activatable/,
  );
});

test("rejects cent values that cannot map exactly to current integer BRL subscription contract", () => {
  assert.throws(
    () => validateZuniCommercialPlanSnapshot({
      ...start,
      pricing: { monthly_cents: 29750 },
    }),
    /whole BRL units/,
  );
});

test("creates deterministic tenant/workspace/subscription and pending entitlements", () => {
  const activation = createZuniActivationPlan({
    plan: start,
    tenantSlug: "Acme-Labs",
    tenantDisplayName: "Acme Labs",
    organizationId,
    createdAt: "2026-08-16T08:40:00.000Z",
  });

  assert.equal(activation.productId, "zuni");
  assert.equal(activation.planId, "start");
  assert.equal(activation.activationMode, "assisted");
  assert.equal(activation.automaticCharge, false);
  assert.equal(activation.productionWriteAuthorized, false);
  assert.equal(activation.subscription.status, "assisted_activation");
  assert.equal(activation.subscription.monthlyAmount, 297);
  assert.equal(activation.workspace.productId, "zuni");
  assert.ok(activation.entitlements.length >= 7);
  assert.ok(activation.entitlements.every(({ record }) => record.status === "pending"));
  assert.ok(activation.entitlements.every(({ record }) => record.sourcePlanId === "start"));
  assert.ok(activation.entitlements.some(({ record, kind, value }) =>
    record.capability === "limit-whatsapp-channels" && kind === "limit" && value === 1
  ));
});

test("does not authorize production write or automatic charge implicitly", () => {
  const activation = createZuniActivationPlan({
    plan: start,
    tenantSlug: "safe-tenant",
    tenantDisplayName: "Safe Tenant",
    organizationId,
  });
  assert.equal(activation.productionWriteAuthorized, false);
  assert.equal(activation.automaticCharge, false);
  assert.notEqual(activation.subscription.status, "active");
});
