export function createFamilyDataMcpReadTools(store) {
  if (!store) throw new TypeError("store is required");
  return Object.freeze({
    "family.purchase.list": (args) => store.purchaseList(args),
    "family.purchase.get": (args) => store.purchaseGet(args),
    "family.product.stats": (args) => store.productStats(args),
    "family.product.price_history": (args) => store.productPriceHistory(args),
    "family.context.chef": (args) => store.chefContext(args),
    "family.evidence.get": (args) => store.evidenceGet(args)
  });
}

export function assertFamilyDataMcpReadOnly(tools) {
  const names = Object.keys(tools);
  const forbidden = names.filter((name) => name.includes("ingest.apply") || name.includes("correction.append") || name.endsWith(".write"));
  if (forbidden.length) throw new Error(`write_tools_forbidden:${forbidden.join(",")}`);
  return true;
}
