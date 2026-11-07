import {
  assertUniJuriRemoteSignerKeychainPreflightIsReadOnly,
  collectUniJuriRemoteSignerKeychainPreflight,
} from "../src/saas-unijuri-delegated-binding-keychain-preflight.mjs";

const result = assertUniJuriRemoteSignerKeychainPreflightIsReadOnly(
  await collectUniJuriRemoteSignerKeychainPreflight(),
);

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.safeToProvision ? 0 : 2;
