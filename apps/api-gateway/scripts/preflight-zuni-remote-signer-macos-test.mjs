import {
  collectZuniRemoteSignerMacosPreflight,
  assertZuniRemoteSignerMacosPreflightIsReadOnly,
} from "../src/saas-delegated-binding-remote-signer-macos-preflight.mjs";

const result = assertZuniRemoteSignerMacosPreflightIsReadOnly(
  await collectZuniRemoteSignerMacosPreflight(),
);

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.safeToPrepareLocalTest ? 0 : 2;
