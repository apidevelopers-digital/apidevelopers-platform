import assert from "node:assert/strict";
import test from "node:test";

import {
  PlanDomainError,
  createEntitlement,
  createMemoryPlanRepository,
  createMeter,
  createPlanService,
  createPlanVersion,
  createProductVersion,
  evaluatePlanChange,
  isEffective,
} from "../src/index.mjs";

const at = "2026-07-20T18:00:00.000Z";

const product = (overrides = {}) => createProductVersion({
  id: "platform-core",
  name: "API Developers Platform Core",
  status: "READY_TO_SELL",
  version: 1,
  apiIds: ["catalog", "identity", "projects", "apikeys"],
  planIds: ["developer", "team"],
  provisioningProfile: "platform-core-v1",
  billingProfile: "subscription-with-usage-v1",
  effectiveFrom: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

const plan = (overrides = {}) => createPlanVersion({
  id: "developer",
  productId: "platform-core",
  name: "Developer",
  status: "ACTIVE",
  version: 1,
  currency: "BRL",
  unitAmount: 9900,
  priceReference: "PRICE_APPROVED_2026_01",
  billingInterval: "month",
  entitlements: [
    createEntitlement({ key: "projects.max", value: 3 }),
  ],
  meters: [
    createMeter({
      key: "api.requests",
      unit: "request",
      period: "month",
      includedUnits: 10000,
      overagePriceReference: "OVERAGE_APPROVED_2026_01",
    }),
  ],
  upgradeTo: ["team"],
  downgradeTo: [],
  effectiveFrom: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

test("creates deeply immutable product and plan versions", () => {
  const value = plan({ metadata: { source: { catalog: "v1" } } });
  assert.equal(value.unitAmount, 9900);
  assert.throws(() => {
    value.metadata.source.catalog = "v2";
  }, TypeError);
  assert.equal(product().status, "READY_TO_SELL");
});

test("preserves PRICE_TBD without allowing inconsistent approved amounts", () => {
  const draft = plan({
    status: "DRAFT",
    unitAmount: null,
    priceReference: "PRICE_TBD",
  });
  assert.equal(draft.unitAmount, null);
  assert.throws(
    () => plan({ unitAmount: 1000, priceReference: "PRICE_TBD" }),
    (error) => error.code === "inconsistent_price",
  );
});

test("validates unique entitlements, meters and plan transitions", () => {
  assert.throws(
    () => plan({
      entitlements: [
        createEntitlement({ key: "projects.max", value: 3 }),
        createEntitlement({ key: "projects.max", value: 5 }),
      ],
    }),
    (error) => error.code === "duplicate_entitlement",
  );
  assert.throws(
    () => plan({ upgradeTo: ["developer"] }),
    (error) => error.code === "self_plan_change",
  );
});

test("resolves effective versions using semi-open windows", () => {
  const repository = createMemoryPlanRepository({
    initialPlans: [
      plan({ version: 1, effectiveTo: "2026-08-01T00:00:00.000Z" }),
      plan({
        version: 2,
        unitAmount: 11900,
        priceReference: "PRICE_APPROVED_2026_02",
        effectiveFrom: "2026-08-01T00:00:00.000Z",
      }),
    ],
  });
  assert.equal(repository.resolvePlan("developer", "2026-07-31T23:59:59.999Z").version, 1);
  assert.equal(repository.resolvePlan("developer", "2026-08-01T00:00:00.000Z").version, 2);
  assert.equal(isEffective(plan(), at), true);
});

test("protects immutable version keys from conflicting rewrites", () => {
  const repository = createMemoryPlanRepository();
  repository.putPlan(plan());
  assert.throws(
    () => repository.putPlan(plan({
      unitAmount: 11900,
      priceReference: "PRICE_APPROVED_2026_02",
    })),
    (error) =>
      error instanceof PlanDomainError &&
      error.code === "plan_version_conflict",
  );
});

test("evaluates explicit upgrade and downgrade policies", () => {
  const current = plan();
  const target = plan({
    id: "team",
    name: "Team",
    unitAmount: 29900,
    priceReference: "PRICE_APPROVED_2026_TEAM",
    upgradeTo: [],
    downgradeTo: ["developer"],
  });
  assert.deepEqual(evaluatePlanChange({
    fromPlan: current,
    toPlan: target,
    direction: "upgrade",
  }), {
    allowed: true,
    reason: "allowed",
    timing: "immediate",
    fromPlanId: "developer",
    toPlanId: "team",
    direction: "upgrade",
  });
  assert.equal(evaluatePlanChange({
    fromPlan: target,
    toPlan: current,
    direction: "downgrade",
  }).timing, "period_end");
});

test("requires product and plan to be jointly sellable", () => {
  const service = createPlanService({
    repository: createMemoryPlanRepository({
      initialProducts: [product()],
      initialPlans: [plan()],
    }),
    clock: () => at,
  });
  const result = service.getSellablePlan("developer");
  assert.equal(result.product.id, "platform-core");
  assert.equal(result.plan.id, "developer");

  const blocked = createPlanService({
    repository: createMemoryPlanRepository({
      initialProducts: [product({ status: "SPECIFIED" })],
      initialPlans: [plan()],
    }),
    clock: () => at,
  });
  assert.throws(
    () => blocked.getSellablePlan("developer"),
    (error) => error.code === "product_not_sellable",
  );
});

test("rejects active plan not declared by effective product", () => {
  const service = createPlanService({
    repository: createMemoryPlanRepository({
      initialProducts: [product({ planIds: ["team"] })],
      initialPlans: [plan()],
    }),
    clock: () => at,
  });
  assert.throws(
    () => service.getSellablePlan("developer"),
    (error) => error.code === "plan_not_in_product",
  );
});

test("lists catalog versions deterministically", () => {
  const repository = createMemoryPlanRepository({
    initialProducts: [product()],
    initialPlans: [
      plan({
        id: "team",
        name: "Team",
        unitAmount: 29900,
        priceReference: "PRICE_APPROVED_2026_TEAM",
        upgradeTo: [],
        downgradeTo: ["developer"],
      }),
      plan(),
    ],
  });
  assert.deepEqual(
    repository.listPlans({ productId: "platform-core" }).map(({ id }) => id),
    ["developer", "team"],
  );
});
