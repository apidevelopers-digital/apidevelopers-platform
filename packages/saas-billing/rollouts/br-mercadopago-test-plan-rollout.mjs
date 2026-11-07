import { BR_PUBLISHED_SAAS_TEST_PRICES } from "../catalogs/br-published-saas-test.mjs";

export const BR_MERCADOPAGO_TEST_PILOT_PRICE_ID = "universo.start.month.br";

const BACK_URLS = Object.freeze({
  "uni.co": "https://sitedauni.com/apps/unico/",
  imuni: "https://sitedauni.com/apps/imuni/",
  "uni.juri": "https://sitedauni.com/apps/juri/",
  "uni.verso": "https://sitedauni.com/apps/universo/",
  zuni: "https://zuni.sitedauni.com/",
});

const PRODUCT_LABELS = Object.freeze({
  "uni.co": "uni.co",
  imuni: "imuni",
  "uni.juri": "uni.juri",
  "uni.verso": "uni.verso",
  zuni: "Zuni",
});

const PLAN_LABELS = Object.freeze({
  start: "Start",
  pro: "Pro",
  scale: "Scale",
});

function major(amountMinor) {
  return Number.parseFloat((amountMinor / 100).toFixed(2));
}

function frequency(interval) {
  if (interval === "month") return Object.freeze({ frequency: 1, frequencyType: "months" });
  if (interval === "year") return Object.freeze({ frequency: 12, frequencyType: "months" });
  throw new TypeError(`unsupported Mercado Pago interval: ${interval}`);
}

function reasonFor(price) {
  if (price.priceId === BR_MERCADOPAGO_TEST_PILOT_PRICE_ID) {
    return "uni.verso start - piloto de teste API Developers";
  }
  const cadence = price.interval === "year" ? "Anual" : "Mensal";
  return `${PRODUCT_LABELS[price.productId]} ${PLAN_LABELS[price.planId]} ${cadence} - API Developers`;
}

function plannedItem(price, existingPriceIds) {
  const recurring = frequency(price.interval);
  const state = existingPriceIds.has(price.priceId)
    ? "external_created_unbound"
    : "create_required";

  return Object.freeze({
    priceId: price.priceId,
    productId: price.productId,
    planId: price.planId,
    interval: price.interval,
    amountMinor: price.amountMinor,
    currency: price.currency,
    provider: "mercadopago",
    environment: "test",
    state,
    providerPlanId: null,
    checkoutUrl: null,
    createPayload: Object.freeze({
      reason: reasonFor(price),
      auto_recurring: Object.freeze({
        frequency: recurring.frequency,
        frequency_type: recurring.frequencyType,
        transaction_amount: major(price.amountMinor),
        currency_id: price.currency,
      }),
      back_url: BACK_URLS[price.productId],
    }),
  });
}

export function createMercadoPagoTestPlanRolloutDryRun({
  existingPriceIds = [BR_MERCADOPAGO_TEST_PILOT_PRICE_ID],
} = {}) {
  const existing = new Set(existingPriceIds);
  const catalogIds = new Set(BR_PUBLISHED_SAAS_TEST_PRICES.map((price) => price.priceId));

  for (const priceId of existing) {
    if (!catalogIds.has(priceId)) {
      throw new Error(`unknown published test price: ${priceId}`);
    }
  }

  const items = BR_PUBLISHED_SAAS_TEST_PRICES.map((price) => plannedItem(price, existing));
  const createRequired = items.filter((item) => item.state === "create_required");
  const existingUnbound = items.filter((item) => item.state === "external_created_unbound");

  return Object.freeze({
    provider: "mercadopago",
    environment: "test",
    writesEnabled: false,
    liveEnabled: false,
    publicCheckoutEnabled: false,
    activeCatalogPriceCount: items.length,
    productCount: new Set(items.map((item) => item.productId)).size,
    existingExternalPlanCount: existingUnbound.length,
    createRequiredCount: createRequired.length,
    excludedDraftProducts: Object.freeze(["uni.social"]),
    items: Object.freeze(items),
  });
}

export const BR_MERCADOPAGO_TEST_PLAN_ROLLOUT_DRY_RUN =
  createMercadoPagoTestPlanRolloutDryRun();
