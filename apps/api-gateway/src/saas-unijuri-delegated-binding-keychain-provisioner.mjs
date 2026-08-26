import { createHash, generateKeyPairSync } from "node:crypto";

import { createOperatorMacosKeychainHelperBridge } from "./operator-macos-keychain-helper-bridge.mjs";
import { createOperatorMacosKeychainNativeWriter } from "./operator-macos-keychain-native-writer.mjs";
import {
  createOperatorMacosKeychainStorageController,
  OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
} from "./operator-macos-keychain-storage-controller.mjs";
import {
  UNIJURI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
  UNIJURI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
} from "./saas-unijuri-delegated-binding-remote-signer-keychain.mjs";

export const UNIJURI_KEYCHAIN_PROVISIONING_APPROVAL =
  "IGOR_APROVA_UNIJURI_KEYCHAIN_PROVISIONING";
export const UNIJURI_DELEGATED_BINDING_KEY_ID =
  "unijuri-binding-20260826-v1";

function publicFingerprint(publicKeyPem) {
  return `sha256:${createHash("sha256").update(publicKeyPem, "utf8").digest("hex")}`;
}

export async function provisionUniJuriDelegatedBindingKeypair({
  approval,
  processRunner,
  platform = process.platform,
  now = () => new Date(),
  generateKeyPair = generateKeyPairSync,
} = {}) {
  if (approval !== UNIJURI_KEYCHAIN_PROVISIONING_APPROVAL) {
    throw new Error("unijuri_keychain_provisioning_approval_denied");
  }
  if (typeof processRunner !== "function") {
    throw new TypeError("processRunner must be a function");
  }
  if (platform !== "darwin") {
    throw new Error("unijuri_keychain_provisioning_platform_denied");
  }

  const { publicKey, privateKey } = generateKeyPair("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const publicKeyPem = String(publicKey);
  const privateKeyBytes = Buffer.from(String(privateKey), "utf8");

  const bridge = createOperatorMacosKeychainHelperBridge({
    processRunner,
    enabled: true,
    platform,
    service: UNIJURI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
    account: UNIJURI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
  });
  const writer = createOperatorMacosKeychainNativeWriter({
    nativeBridge: bridge,
    enabled: true,
    platform,
    service: UNIJURI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
    account: UNIJURI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
  });
  const controller = createOperatorMacosKeychainStorageController({
    keychainWriter: writer,
    enabled: true,
    platform,
    requiredApproval: OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
    service: UNIJURI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
    account: UNIJURI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
    now,
  });

  try {
    const evidence = await controller.storePrivateKey({
      approval: OPERATOR_MACOS_KEYCHAIN_STORAGE_APPROVAL,
      privateKeyBytes,
      overwrite: false,
    });

    return Object.freeze({
      ok: true,
      keyId: UNIJURI_DELEGATED_BINDING_KEY_ID,
      algorithm: "RSA-PSS-SHA256",
      rsaBits: 2048,
      keychainItemCreated: evidence.keychainItemCreated,
      keychainItemReplaced: evidence.keychainItemReplaced,
      secretReturned: false,
      privateKeyArtifactCreated: false,
      publicKeyPem,
      publicKeyFingerprint: publicFingerprint(publicKeyPem),
      privateKeyFingerprint: evidence.fingerprint,
      service: evidence.service,
      account: evidence.account,
      createdAt: evidence.createdAt,
    });
  } finally {
    privateKeyBytes.fill(0);
  }
}
