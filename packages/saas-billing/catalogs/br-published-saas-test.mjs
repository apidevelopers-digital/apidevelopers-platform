import { createBillingCatalog } from "../src/catalog.mjs";
import { BR_MAIN_DRAFT_PRICES } from "./br-main-draft.mjs";
import { BR_ZUNI_V1_PRICES } from "./br-zuni-v1.mjs";

const PUBLISHED_PRODUCTS = new Set(["uni.co", "imuni", "uni.juri", "uni.verso", "zuni"]);
const ZUNI_PUBLIC_PLANS = new Set(["start", "pro", "scale"]);

const uniPrices = BR_MAIN_DRAFT_PRICES
  .filter((price) => PUBLISHED_PRODUCTS.has(price.productId))
  .map((price) => Object.freeze({ ...price, active: true }));

const zuniPrices = BR_ZUNI_V1_PRICES
  .filter((price) => ZUNI_PUBLIC_PLANS.has(price.planId) && price.interval === "month")
  .map((price) => Object.freeze({ ...price, active: true }));

const prices = Object.freeze([...uniPrices, ...zuniPrices]);

export const BR_PUBLISHED_SAAS_TEST_CATALOG = createBillingCatalog(prices);
export const BR_PUBLISHED_SAAS_TEST_PRICES = prices;
export const BR_PUBLISHED_SAAS_TEST_PRODUCTS = Object.freeze([
  "uni.co",
  "imuni",
  "uni.juri",
  "uni.verso",
  "zuni",
]);
