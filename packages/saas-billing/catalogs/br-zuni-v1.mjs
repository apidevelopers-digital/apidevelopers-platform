import { createBillingCatalog } from "../src/catalog.mjs";

/*
  Catalogo comercial BR do Zuni.
  Apenas precos mensais explicitamente definidos estao ativos nesta versao.
  Valores anuais nao devem ser derivados ou ativados sem decisao comercial explicita.
*/
const prices = [
  {
    priceId: "zuni.start.month.br",
    productId: "zuni",
    planId: "start",
    currency: "BRL",
    interval: "month",
    amountMinor: 29700,
    taxBehavior: "unspecified",
    active: true,
  },
  {
    priceId: "zuni.pro.month.br",
    productId: "zuni",
    planId: "pro",
    currency: "BRL",
    interval: "month",
    amountMinor: 59700,
    taxBehavior: "unspecified",
    active: true,
  },
  {
    priceId: "zuni.scale.month.br",
    productId: "zuni",
    planId: "scale",
    currency: "BRL",
    interval: "month",
    amountMinor: 129000,
    taxBehavior: "unspecified",
    active: true,
  },
  {
    priceId: "zuni.master.month.br",
    productId: "zuni",
    planId: "master",
    currency: "BRL",
    interval: "month",
    amountMinor: 169000,
    taxBehavior: "unspecified",
    active: true,
  },
];

export const BR_ZUNI_V1_CATALOG = createBillingCatalog(prices);
export const BR_ZUNI_V1_PRICES = Object.freeze(prices);
