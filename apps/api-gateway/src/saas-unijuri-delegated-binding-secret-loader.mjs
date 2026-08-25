import { withOperatorSecret } from "./operator-secret-provider-contract.mjs";
import { createUniJuriDelegatedBindingSigner } from "./saas-unijuri-delegated-binding-proof.mjs";

function requiredText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

export async function loadUniJuriDelegatedBindingSigner({
  secretProvider,
  privateKeyRef,
  keyId,
  ttlSeconds = 60,
  clock,
  nonceFactory,
} = {}) {
  const secretRef = requiredText(privateKeyRef, "privateKeyRef");
  const normalizedKeyId = requiredText(keyId, "keyId");

  return withOperatorSecret({
    secretProvider,
    access: Object.freeze({
      secretRef,
      purpose: "uni-juri.delegated-binding.sign",
    }),
    consumer: (lease) => {
      const privateKeyPem = Buffer.from(lease.bytes).toString("utf8");
      return createUniJuriDelegatedBindingSigner({
        privateKeyPem,
        keyId: normalizedKeyId,
        ttlSeconds,
        ...(clock ? { clock } : {}),
        ...(nonceFactory ? { nonceFactory } : {}),
      });
    },
  });
}
