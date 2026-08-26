import { constants, createPrivateKey, sign as cryptoSign } from "node:crypto";
import { createOperatorMacosKeychainVaultClient } from "./operator-macos-keychain-vault-client.mjs";
import { createUniJuriRemoteSignerService } from "./saas-unijuri-delegated-binding-remote-signer-service.mjs";

export const UNIJURI_REMOTE_SIGNER_SECRET_REF = "vault://uni-juri/delegated-binding/private-key";
export const UNIJURI_REMOTE_SIGNER_PURPOSE = "uni-juri.delegated-binding.sign";
export const UNIJURI_REMOTE_SIGNER_KEYCHAIN_SERVICE = "digital.apidevelopers.unijuri-remote-signer";
export const UNIJURI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT = "delegated-binding-private-key";

export function createUniJuriRemoteSignerKeychainService({
  keyId,
  keychainReader,
  clock = () => new Date(),
  nonceStore = new Set(),
} = {}) {
  const vaultClient = createOperatorMacosKeychainVaultClient({
    keychainReader,
    allowedSecretRefs: [UNIJURI_REMOTE_SIGNER_SECRET_REF],
    allowedPurposes: [UNIJURI_REMOTE_SIGNER_PURPOSE],
    service: UNIJURI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
    account: UNIJURI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
    now: clock,
    leaseLifetimeMs: 15_000,
    maxSecretBytes: 8_192,
  });

  return createUniJuriRemoteSignerService({
    keyId,
    clock,
    nonceStore,
    async signPayload({ algorithm, payloadB64u }) {
      if (algorithm !== "RSA-PSS-SHA256") throw new Error("remote_signer_keychain_algorithm_denied");
      return vaultClient.withSecretLease(
        {
          secretRef: UNIJURI_REMOTE_SIGNER_SECRET_REF,
          purpose: UNIJURI_REMOTE_SIGNER_PURPOSE,
          correlationId: `uni-juri-remote-signer:${keyId}`,
          tenantId: "institution.apidevelopers-digital",
        },
        async (lease) => {
          let key;
          try {
            key = createPrivateKey({ key: Buffer.from(lease.bytes), format: "pem" });
          } catch {
            throw new Error("remote_signer_keychain_private_key_invalid");
          }
          if (key.asymmetricKeyType !== "rsa") throw new Error("remote_signer_keychain_private_key_type_denied");
          if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error("remote_signer_keychain_private_key_too_small");
          return cryptoSign("sha256", Buffer.from(payloadB64u, "utf8"), {
            key,
            padding: constants.RSA_PKCS1_PSS_PADDING,
            saltLength: 32,
          }).toString("base64url");
        },
      );
    },
  });
}
