import { createProductAwareDelegatedBindingSigner } from "./saas-delegated-binding-product-router.mjs";
import { resolveZuniDelegatedBindingSigner } from "./saas-delegated-binding-runtime-config.mjs";
import { resolveUniJuriDelegatedBindingSigner } from "./saas-unijuri-delegated-binding-runtime-config.mjs";

function requireResolver(resolver, name) {
  if (typeof resolver !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
  return resolver;
}

function normalizeResolution(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError( `${name} must return an object`);
  }
  if (typeof value.configured !== "boolean") {
    throw new TypeError(`${name}.configured must be a boolean`);
  }
  if (
    value.configured &&
    typeof value.signer?.signBinding !== "function"
  ) {
    throw new TypeError(`${name}.signer.signBinding must be a function when configured`);
  }

  return Object.freeze({
    configured: value.configured,
    signer: value.configured ? value.signer : null,
    descriptor:
      value.descriptor && typeof value.descriptor === "object"
        ? value.descriptor
        : Object.freeze({
            configured: value.configured,
            mode: value.configured ? "configured" : "deny-by-default",
          }),
  });
}

export async function resolveProductAwareDelegatedBindingOperationalSigner({
  env = process.env,
  secretProvider,
  credentialProvider,
  zuniResolver = resolveZuniDelegatedBindingSigner,
  uniJuriResolver = resolveUniJuriDelegatedBindingSigner,
} = {}) {
  const resolveZuni = requireResolver(zuniResolver, "zuniResolver");
  const resolveUniJuri = requireResolver(uniJuriResolver, "uniJuriResolver");

  const zuni = normalizeResolution(
    await resolveZuni({ env, secretProvider }),
    "zuniResolver",
  );
  const uniJuri = normalizeResolution(
    await resolveUniJuri({ env, secretProvider, credentialProvider }),
    "uniJuriResolver",
  );

  const router = createProductAwareDelegatedBindingSigner({
    ...(zuni.configured ? { zuniSigner: zuni.signer } : {}),
    ...(uniJuri.configured ? { uniJuriSigner: uniJuri.signer } : {}),
  });

  const configured = router.configuredProducts.length > 0;

  return Object.freeze({
    configured,
    signer: configured ? router : null,
    descriptor: Object.freeze({
      configured,
      mode: configured ? "product-aware-secret-reference" : "deny-by-default",
      configuredProducts: router.configuredProducts,
      privateKeyMaterialConfigured: false,
      products: Object.freeze({
        zuni: zuni.descriptor,
        "uni-juri": uniJuri.descriptor,
      }),
    }),
  });
}
