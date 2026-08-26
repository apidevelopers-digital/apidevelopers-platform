import { normalizeOperatorSecretRef } from "./operator-secret-provider-contract.mjs";
import { loadUniJuriDelegatedBindingSigner } from "./saas-unijuri-delegated-binding-secret-loader.mjs";
import { createUniJuriRemoteBindingSigner } from "./saas-unijuri-delegated-binding-remote-signer.mjs";
import { createUniJuriRemoteSignerHttpsTransport } from "./saas-unijuri-delegated-binding-remote-signer-https-transport.mjs";

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function parseTtlSeconds(value) {
  if (value === undefined || value === null || String(value).trim() === "") return 60;
  const ttl = Number(value);
  if (!Number.isSafeInteger(ttl) || ttl < 15 || ttl > 300) {
    throw new TypeError(
      "UNIJURI_DELEGATED_BINDING_TTL_SECONDS must be an integer between 15 and 300",
    );
  }
  return ttl;
}

function parseMode(env) {
  const raw = optionalText(env.UNIJURI_DELEGATED_BINDING_SIGNER_MODE);
  if (!raw) return undefined;
  const mode = raw.toLowerCase();
  if (!["secret-reference", "remote"].includes(mode)) {
    throw new TypeError(
      "UNIJURI_DELEGATED_BINDING_SIGNER_MODE must be secret-reference or remote",
    );
  }
  return mode;
}

export function resolveUniJuriDelegatedBindingRuntimeConfig(env = process.env) {
  const directPem = optionalText(env.UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_PEM);
  if (directPem) {
    throw new TypeError(
      "UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_PEM is forbidden; use an opaque secret reference",
    );
  }

  const privateKeyRef = optionalText(env.UNIJURI_DELEGATED_BINDING_PRIVATE_KEY_REF);
  const remoteEndpoint = optionalText(env.UNIJURI_DELEGATED_BINDING_REMOTE_SIGNER_ENDPOINT);
  const keyId = optionalText(env.UNIJURI_DELEGATED_BINDING_KEY_ID);
  const explicitMode = parseMode(env);

  if (!privateKeyRef && !remoteEndpoint && !keyId && !explicitMode) {
    return Object.freeze({
      configured: false,
      reason: "unijuri_delegated_binding_not_configured",
    });
  }

  const mode = explicitMode ?? (remoteEndpoint ? "remote" : "secret-reference");
  const ttlSeconds = parseTtlSeconds(env.UNIJURI_DELEGATED_BINDING_TTL_SECONDS);

  if (mode === "remote") {
    if (privateKeyRef) {
      throw new TypeError(
        "UniJuri remote delegated binding must not configure a private key ref",
      );
    }
    if (!remoteEndpoint || !keyId) {
      throw new TypeError(
        "UniJuri remote delegated binding runtime requires remote signer endpoint and key id together",
      );
    }
    return Object.freeze({
      configured: true,
      mode,
      remoteEndpoint,
      keyId,
      ttlSeconds,
    });
  }

  if (remoteEndpoint) {
    throw new TypeError(
      "UniJuri secret-reference delegated binding must not configure a remote signer endpoint",
    );
  }
  if (!privateKeyRef || !keyId) {
    throw new TypeError(
      "UniJuri delegated binding runtime requires private key ref and key id together",
    );
  }

  return Object.freeze({
    configured: true,
    mode,
    privateKeyRef: normalizeOperatorSecretRef(privateKeyRef),
    keyId,
    ttlSeconds,
  });
}

export async function resolveUniJuriDelegatedBindingSigner({
  env = process.env,
  secretProvider,
  credentialProvider,
  loader = loadUniJuriDelegatedBindingSigner,
  remoteSignerFactory = createUniJuriRemoteBindingSigner,
  remoteTransportFactory = createUniJuriRemoteSignerHttpsTransport,
  fetchImpl,
  clock,
  nonceFactory,
} = {}) {
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

  if (config.mode === "remote") {
    if (typeof credentialProvider !== "function") {
      throw new TypeError(
        "delegated binding credential provider is required when UniJuri remote delegated binding is configured",
     );
    }
    const transport = remoteTransportFactory({
      endpoint: config.remoteEndpoint,
      credentialProvider,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
    const signer = remoteSignerFactory({
      keyId: config.keyId,
      transport,
      ttlSeconds: config.ttlSeconds,
      ...(clock ? { clock } : {}),
     ...(nonceFactory ? { nonceFactory } : {}),
    });

    return Object.freeze({
      configured: true,
      signer,
      descriptor: Object.freeze({
        configured: true,
        mode: "remote",
        productId: "uni-juri",
        purpose: "uni-juri.delegated-binding.remote-signer",
        keyId: config.keyId,
        ttlSeconds: config.ttlSeconds,
        remoteEndpointConfigured: true,
        privateKeyReferenceConfigured: false,
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
