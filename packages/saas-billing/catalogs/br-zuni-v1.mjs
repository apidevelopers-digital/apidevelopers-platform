import { createBillingCatalog } from "../src/catalog.mjs";

const prices = [
  { priceId: "zuni.start.month.br", productId: "zuni", planId: "start", currency: "BRL", interval: "month", amountMinor: 29700, taxBehavior: "unspecified", active: true },
  { priceId: "zuni.pro.month.br", productId: "zuni", planId: "pro", currency: "BRL", interval: "month", amountMinor: 59700, taxBehavior: "unspecified", active: true },
  { priceId: "zuni.scale.month.br", productId: "zuni", planId: "scale", currency: "BRL", interval: "month", amountMinor: 129000, taxBehavior: "unspecified", active: true },
  { priceId: "zuni.master.month.br", productId: "zuni", planId: "master", currency: "BRL", interval: "month", amountMinor: 169000, taxBehavior: "unspecified", active: true },

  { priceId: "zuni.start.year.br", productId: "zuni", planId: "start", currency: "BRL", interval: "year", amountMinor: 297000, taxBehavior: "unspecified", active: true },
  { priceId: "zuni.pro.year.br", productId: "zuni", planId: "pro", currency: "BRL", interval: "year", amountMinor: 597000, taxBehavior: "unspecified", active: true },
  { priceId: "zuni.scale.year.br", productId: "zuni", planId: "scale", currency: "BRL", interval: "year", amountMinor: 1290000, taxBehavior: "unspecified", active: true },
];

export const BR_ZUNI_V1_CATALOG = createBillingCatalog(prices);
export const BR_ZUNI_V1_PRICES = Object.freeze(prices);
