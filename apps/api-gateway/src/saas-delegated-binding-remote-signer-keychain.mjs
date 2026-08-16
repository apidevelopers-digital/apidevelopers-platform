import {
  constants as cryptoConstants,
  createPrivateKey,
  sign as cryptoSign,
} from "node:crypto";

import {
  createOperatorMacosKeychainVaultClient,
} from "./operator-macos-keychain-vault-client.mjs";
import {
  createZuniRemoteSignerService,
} from "./saas-delegated-binding-remote-signer-daemon.mjs";

export const ZUNI_REMOTE_SIGNER_KEYCHAIN_SECRET_REF =
  "vault://zuni/delegated-binding/private-key";
export const ZUNI_REMOTE_SIGNER_KEYCHAIN_PURPOSE =
  "zuni.delegated-binding.sign";
export const ZUNI_REMOTE_SIGNER_KEYCHAIN_SERVICE =
  "digital.apidevelopers.zuni-remote-signer";
export const ZUNI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT =
  "delegated-binding-private-key";

function requiredText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function createLeaseSigner({ vaultClient, secretRef, purpose }) {
  return async function signPayload({ algorithm, keyId, payloadB64u }) {
    if (algorithm !== "RSA-PSS-SHA256") {
      throw new Error("remote_signer_keychain_algorithm_denied");
    }

    const normalizedKeyId = requiredText(keyId, "keyId");
    const normalizedPayload = requiredText(payloadB64u, "payloadB64u");

    return vaultClient.withSecretLease(
      {
        secretRef,
        purpose,
        correlationId: `zuni-remote-signer:${normalizedKeyId}`,
        tenantId: "institution.apidevelopers-digital",
      },
      async (lease) => {
        let privateKey;
        try {
          privateKey = createPrivateKey({
            key: Buffer.from(lease.bytes),
            format: "pem",
          });
        } catch {
          throw new Error("remote_signer_keychain_private_key_invalid");
        }

        if (privateKey.asymmetricKeyType !== "rsa") {
          throw new Error("remote_signer_keychain_private_key_type_denied");
        }

        const modulusLength =
          privateKey.asymmetricKeyDetails?.modulusLength ?? 0;
        if (modulusLength < 2048) {
          throw new Error("remote_signer_keychain_private_key_too_small");
        }

        return cryptoSign(
          "sha256",
          Buffer.from(normalizedPayload, "utf8"),
          {
            key: privateKey,
            padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
            saltLength: 32,
          },
        ).toString("base64url");
      },
    );
  };
}

export function createZuniRemoteSignerKeychainService({
  keyId,
  keychainReader,
  clock = () => new Date(),
  nonceStore = new Set(),
  service = ZUNI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
  account = ZUNI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
  secretRef = ZUNI_REMOTE_SIGNER_KEYCHAIN_SECRET_REF,
  purpose = ZUNI_REMOTE_SIGNER_KEYCHAIN_PURPOSE,
  leaseLifetimeMs = 15_000,
  maxSecretBytes = 8_192,
  maxBodyBytes,
  maxTtlSeconds,
  maxClockSkewSeconds,
} = {}) {
  const normalizedKeyId = requiredText(keyId, "keyId");
  const normalizedSecretRef = requiredText(secretRef, "secretRef");
  const normalizedPurpose = requiredText(purpose, "purpose");

  const vaultClient = createOperatorMacosKeychainVaultClient({
    keychainReader,
    allowedSecretRefs: [normalizedSecretRef],
    allowedPurposes: [normalizedPurpose],
    service,
    account,
    now: clock,
    leaseLifetimeMs,
    maxSecretBytes,
  });

  const signPayload = createLeaseSigner({
    vaultClient,
    secretRef: normalizedSecretRef,
    purpose: normalizedPurpose,
  });

  return createZuniRemoteSignerService({
    keyId: normalizedKeyId,
    signPayload,
    clock,
    nonceStore,
    ...(maxBodyBytes !== undefined ? { maxBodyBytes } : {}),
    ...(maxTtlSeconds !== undefined ? { maxTtlSeconds } : {}),
    ...(maxClockSkewSeconds !== undefined ? { maxClockSkewSeconds } : {}),
  });
}
