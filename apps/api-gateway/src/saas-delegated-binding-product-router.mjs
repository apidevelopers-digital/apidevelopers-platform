function normalizeProductId(value) {
  return String(value ?? "").trim();
}

function normalizeSigner(signer, name) {
  if (signer === undefined || signer === null) return null;
  if (typeof signer?.signBinding !== "function") {
    throw new TypeError(`${name}.signBinding must be a function`);
  }
  return signer;
}

export function createProductAwareDelegatedBindingSigner({
  zuniSigner,
  uniJuriSigner,
} = {}) {
  const routes = new Map();

  const normalizedZuniSigner = normalizeSigner(zuniSigner, "zuniSigner");
  if (normalizedZuniSigner) routes.set("zuni", normalizedZuniSigner);

  const normalizedUniJuriSigner = normalizeSigner(
    uniJuriSigner,
    "uniJuriSigner",
  );
  if (normalizedUniJuriSigner) routes.set("uni-juri", normalizedUniJuriSigner);

  const configuredProducts = Object.freeze([...routes.keys()].sort());

  return Object.freeze({
    configuredProducts,

    signBinding(binding = {}) {
      const productId = normalizeProductId(binding?.productId);
      if (!productId) return null;

      const signer = routes.get(productId);
      if (!signer) return null;

      return signer.signBinding(binding);
    },
  });
}
