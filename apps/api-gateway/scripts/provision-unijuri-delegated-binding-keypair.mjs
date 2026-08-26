import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createBoundedSpawnProcessRunner } from "../src/operator-bounded-spawn-process-runner.mjs";
import {
  provisionUniJuriDelegatedBindingKeypair,
  UNIJURI_KEYCHAIN_PROVISIONING_APPROVAL,
} from "../src/saas-unijuri-delegated-binding-keychain-provisioner.mjs";

const approval = String(process.argv[2] ?? "").trim();
const publicKeyPath = resolve(String(process.argv[3] ?? "").trim());

if (approval !== UNIJURI_KEYCHAIN_PROVISIONING_APPROVAL) {
  throw new Error("unijuri_keychain_provisioning_approval_denied");
}
if (!publicKeyPath) {
  throw new Error("public_key_output_path_required");
}

const result = await provisionUniJuriDelegatedBindingKeypair({
  approval,
  processRunner: createBoundedSpawnProcessRunner(),
});

await writeFile(publicKeyPath, result.publicKeyPem, {
  encoding: "utf8",
  mode: 0o600,
  flag: "wx",
});

const sanitized = {
  ok: result.ok,
  keyId: result.keyId,
  algorithm: result.algorithm,
  rsaBits: result.rsaBits,
  keychainItemCreated: result.keychainItemCreated,
  keychainItemReplaced: result.keychainItemReplaced,
  secretReturned: result.secretReturned,
  privateKeyArtifactCreated: result.privateKeyArtifactCreated,
  publicKeyFingerprint: result.publicKeyFingerprint,
  privateKeyFingerprint: result.privateKeyFingerprint,
  service: result.service,
  account: result.account,
  createdAt: result.createdAt,
  publicKeyPath,
};

process.stdout.write(`${JSON.stringify(sanitized)}\n`);
