import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  startZuniRemoteSignerMacosTestRuntime,
} from "../src/saas-delegated-binding-remote-signer-macos-runtime.mjs";
import {
  ZUNI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
  ZUNI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
} from "../src/saas-delegated-binding-remote-signer-keychain.mjs";

const execFileAsync = promisify(execFile);

async function keychainReader({ service, account }) {
  if (
    service !== ZUNI_REMOTE_SIGNER_KEYCHAIN_SERVICE ||
    account !== ZUNI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT
  ) {
    throw new Error("keychain_descriptor_denied");
  }

  const { stdout } = await execFileAsync(
    "/usr/bin/security",
    [
      "find-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w",
    ],
    {
      encoding: "buffer",
      maxBuffer: 16 * 1024,
      timeout: 2_500,
    },
  );

  return {
    bytes: Buffer.from(stdout).subarray(0, Math.max(0, stdout.length - (stdout.at(-1) === 10 ? 1 : 0))),
    version: "macos-keychain-test-item",
  };
}

const runtime = await startZuniRemoteSignerMacosTestRuntime({
  keychainReader,
});

const address = runtime.daemon.address;
process.stdout.write(
  JSON.stringify({
    service: "zuni-remote-signer",
    mode: runtime.config.mode,
    host: address?.address ?? runtime.config.host,
    port: address?.port ?? runtime.config.port,
  }) + "\n",
);

async function shutdown() {
  await runtime.close();
  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
