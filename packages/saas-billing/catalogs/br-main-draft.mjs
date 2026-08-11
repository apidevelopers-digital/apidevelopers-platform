import { createBillingCatalog } from "../src/catalog.mjs";

const prices = [
  { priceId: "unico.start.month.br", productId: "uni.co", planId: "start", currency: "BRL", interval: "month", amountMinor: 9700, taxBehavior: "unspecified", active: false },
  { priceId: "unico.pro.month.br", productId: "uni.co", planId: "pro", currency: "BRL", interval: "month", amountMinor: 29700, taxBehavior: "unspecified", active: false },
  { priceId: "unico.scale.month.br", productId: "uni.co", planId: "scale", currency: "BRL", interval: "month", amountMinor: 59700, taxBehavior: "unspecified", active: false },
  { priceId: "unico.start.year.br", productId: "uni.co", planId: "start", currency: "BRL", interval: "year", amountMinor: 97000, taxBehavior: "unspecified", active: false },
  { priceId: "unico.pro.year.br", productId: "uni.co", planId: "pro", currency: "BRL", interval: "year", amountMinor: 297000, taxBehavior: "unspecified", active: false },
  { priceId: "unico.scale.year.br", productId: "uni.co", planId: "scale", currency: "BRL", interval: "year", amountMinor: 597000, taxBehavior: "unspecified", active: false },

  { priceId: "imuni.start.month.br", productId: "imuni", planId: "start", currency: "BRL", interval: "month", amountMinor: 9900, taxBehavior: "unspecified", active: false },
  { priceId: "imuni.pro.month.br", productId: "imuni", planId: "pro", currency: "BRL", interval: "month", amountMinor: 16900, taxBehavior: "unspecified", active: false },
  { priceId: "imuni.scale.month.br", productId: "imuni", planId: "scale", currency: "BRL", interval: "month", amountMinor: 29900, taxBehavior: "unspecified", active: false },
  { priceId: "imuni.start.year.br", productId: "imuni", planId: "start", currency: "BRL", interval: "year", amountMinor: 99000, taxBehavior: "unspecified", active: false },
  { priceId: "imuni.pro.year.br", productId: "imuni", planId: "pro", currency: "BRL", interval: "year", amountMinor: 169000, taxBehavior: "unspecified", active: false },
  { priceId: "imuni.scale.year.br", productId: "imuni", planId: "scale", currency: "BRL", interval: "year", amountMinor: 299000, taxBehavior: "unspecified", active: false },

  { priceId: "unijuri.start.month.br", productId: "uni.juri", planId: "start", currency: "BRL", interval: "month", amountMinor: 14700, taxBehavior: "unspecified", active: false },
  { priceId: "unijuri.pro.month.br", productId: "uni.juri", planId: "pro", currency: "BRL", interval: "month", amountMinor: 29700, taxBehavior: "unspecified", active: false },
  { priceId: "unijuri.scale.month.br", productId: "uni.juri", planId: "scale", currency: "BRL", interval: "month", amountMinor: 59700, taxBehavior: "unspecified", active: false },
  { priceId: "unijuri.start.year.br", productId: "uni.juri", planId: "start", currency: "BRL", interval: "year", amountMinor: 147000, taxBehavior: "unspecified", active: false },
  { priceId: "unijuri.pro.year.br", productId: "uni.juri", planId: "pro", currency: "BRL", interval: "year", amountMinor: 297000, taxBehavior: "unspecified", active: false },
  { priceId: "unijuri.scale.year.br", productId: "uni.juri", planId: "scale", currency: "BRL", interval: "year", amountMinor: 597000, taxBehavior: "unspecified", active: false },

  { priceId: "universo.start.month.br", productId: "uni.verso", planId: "start", currency: "BRL", interval: "month", amountMinor: 4900, taxBehavior: "unspecified", active: false },
  { priceId: "universo.pro.month.br", productId: "uni.verso", planId: "pro", currency: "BRL", interval: "month", amountMinor: 9700, taxBehavior: "unspecified", active: false },
  { priceId: "universo.scale.month.br", productId: "uni.verso", planId: "scale", currency: "BRL", interval: "month", amountMinor: 19700, taxBehavior: "unspecified", active: false },
  { priceId: "universo.start.year.br", productId: "uni.verso", planId: "start", currency: "BRL", interval: "year", amountMinor: 49000, taxBehavior: "unspecified", active: false },
  { priceId: "universo.pro.year.br", productId: "uni.verso", planId: "pro", currency: "BRL", interval: "year", amountMinor: 97000, taxBehavior: "unspecified", active: false },
  { priceId: "universo.scale.year.br", productId: "uni.verso", planId: "scale", currency: "BRL", interval: "year", amountMinor: 197000, taxBehavior: "unspecified", active: false },

  { priceId: "unisocial.start.month.br", productId: "uni.social", planId: "start", currency: "BRL", interval: "month", amountMinor: 0, taxBehavior: "unspecified", active: false },
  { priceId: "unisocial.pro.month.br", productId: "uni.social", planId: "pro", currency: "BRL", interval: "month", amountMinor: 0, taxBehavior: "unspecified", active: false },
  { priceId: "unisocial.scale.month.br", productId: "uni.social", planId: "scale", currency: "BRL", interval: "month", amountMinor: 0, taxBehavior: "unspecified", active: false },
  { priceId: "unisocial.start.year.br", productId: "uni.social", planId: "start", currency: "BRL", interval: "year", amountMinor: 0, taxBehavior: "unspecified", active: false },
  { priceId: "unisocial.pro.year.br", productId: "uni.social", planId: "pro", currency: "BRL", interval: "year", amountMinor: 0, taxBehavior: "unspecified", active: false },
  { priceId: "unisocial.scale.year.br", productId: "uni.social", planId: "scale", currency: "BRL", interval: "year", amountMinor: 0, taxBehavior: "unspecified", active: false },
];

export const BR_MAIN_DRAFT_CATALOG = createBillingCatalog(prices);
export const BR_MAIN_DRAFT_PRICES = Object.freeze(prices);
