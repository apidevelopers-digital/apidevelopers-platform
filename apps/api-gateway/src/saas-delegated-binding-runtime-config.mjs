import { loadZuniDelegatedBindingSigner } from "./saas-delegated-binding-secret-loader.mjs";

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function parseTtlSeconds(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return 60;
  }
  const ttl = Number(value);
  if (!Number.isSafeInteger(ttl) || ttl < 15 || ttl > 300) {
    throw new TypeError("ZUNI_DELEGATED_BINDING_TTL_SECONDS must be an integer between 15 and 300");
  }
  return ttl;
}

export function resolveZuniDelegatedBindingRuntimeConfig(env = process.env) {
  const directPem = optionalText(env.ZUNI_DELEGATED_BINDING_PRIVATE_KEY_PEM);
  if (directPem) {
    throw new TypeError("ZUNI_DELEGATED_BINDING_PRIVATE_KEY_PEM is forbidden; use an opaque secret reference");
  }

  const privateKeyRef = optionalText(env.ZUNI_DELEGATED_BINDING_PRIVATE_KEY_REF);
  const keyId = optionalText(env.ZUNI_DELEGATED_BINDING_KEY_ID);

  if (!privateKeyRef && !keyId) {
    return Object.freeze({
      configured: false,
      reason: "zuni_delegated_binding_not_configured",
    });
  }

  if (!privateKeyRef || !keyId) {
    throw new TypeError("Zuni delegated binding runtime requires private key ref and key id together");
  }

  return Object.freeze({
    configured: true,
    privateKeyRef,
    keyId,
    ttlSeconds: parseTtlSeconds(env.ZUNI_DELEGATED_BINDING_TTL_SECONDS),
  });
}

export async function resolveZuniDelegatedBindingSigner({
  env = process.env,
  secretProvider,
  loader = loadZuniDelegatedBindingSigner,
  clock,
  nonceFactory,
} = {}) {
  if (typeof loader !== "function") {
    throw new TypeError("loader must be a function");
  }

  const config = resolveZuniDelegatedBindingRuntimeConfig(env);
  if (!config.configured) {
    return Object.freeze({
      configured: false,
      signer: null,
      descriptor: Object.freeze({
        configured: false,
        mode: "deny-by-default",
        privateKeyMaterialConfigured: false,
      }),
    });
  }

  const signer = await loader({
    secretProvider,
    privateKeyRef: config.privateKeyRef,
    keyId: config.keyId,
    ttlSeconds: config.ttlSeconds,
    ...(clock ? { clock } : {}),
    ...(nonceFactory ? { nonceFactory } : {}),
  });

  return Object.freeze({
    configured: true,
    signer,
    descriptor: Object.freeze({
      configured: true,
      mode: "secret-reference",
      keyId: config.keyId,
      ttlSeconds: config.ttlSeconds,
      privateKeyReferenceConfigured: true,
      privateKeyMaterialConfigured: false,
    }),
  });
}
