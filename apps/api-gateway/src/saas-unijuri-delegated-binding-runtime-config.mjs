import { normalizeOperatorSecretRef } from "./operator-secret-provider-contract.mjs";
import { loadUniJuriDelegatedBindingSigner } from "./saas-unijuri-delegated-binding-secret-loader.mjs";

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
    throw new TypeError(
      "UNIJURI_DELEGATED_BINDING_TTL_SECONDS must be an integer between 15 and 300",
    );
  }
  return ttl;
}

export function resolveUniJuriDelegatedBindingRuntimeConfig(env = process.env) {
  const directPem = optionalText(env.UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_PEM);
  if (directPem) {
    throw new TypeError(
      "UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_PEM is forbidden; use an opaque secret reference",
    );
  }

  const privateKeyRef = optionalText(env.UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_REF);
  const keyId = optionalText(env.UNIJURI_DELEGATED_BINDING_KEY_ID);

  if (!privateKeyRef && !keyId) {
    return Object.freeze({
      configured: false,
      reason: "unijuri_delegated_binding_not_configured",
    });
  }

  if (!privateKeyRef || !keyId) {
    throw new TypeError(
      "UniJuri delegated binding runtime requires private key ref and key id together",
    );
  }

  return Object.freeze({
    configured: true,
    privateKeyRef: normalizeOperatorSecretRef(privateKeyRef),
    keyId,
    ttlSeconds: parseTtlSeconds(env.UNIJURI_DELEGATED_BINDING_TTL_SECONDS),
  });
}

export async function resolveUniJuriDelegatedBindingSigner({
  env = process.env,
  secretProvider,
  loader = loadUniJuriDelegatedBindingSigner,
  clock,
  nonceFactory,
} = {}) {
  if (typeof loader !== "function") {
    throw new TypeError("loader must be a function");
  }

  const config = resolveUniJuriDelegatedBindingRuntimeConfig(env);
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

  if (typeof secretProvider?.withSecret !== "function") {
    throw new TypeError(
      "delegated binding secret provider is required when UniJuri delegated binding is configured",
    );
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
      productId: "uni-juri",
      purpose: "uni-juri.delegated-binding.sign",
      keyId: config.keyId,
      ttlSeconds: config.ttlSeconds,
      privateKeyReferenceConfigured: true,
      privateKeyMaterialConfigured: false,
    }),
  });
}
