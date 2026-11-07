import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";

import {
  UNIJURI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
  UNIJURI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
  UNIJURI_REMOTE_SIGNER_PURPOSE,
  UNIJURI_REMOTE_SIGNER_SECRET_REF,
} from "./saas-unijuri-delegated-binding-remote-signer-keychain.mjs";

const execFileAsync = promisify(execFile);

export const UNIJURI_DELEGATED_BINDING_PLANNED_KEY_ID =
  "unijuri-binding-20260826-v1";

function sanitize(value) {
  const text = String(value ?? "");
  return text
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[REDACTED_PEM]")
    .replace(/[A-Za-z0-9+/_=-]{48,}/g, "[REDACTED_LONG_TOKEN]");
}

async function run(execFn, command, args = [], options = {}) {
  try {
    const result = await execFn(command, args, {
      encoding: "utf8",
      timeout: 2500,
      maxBuffer: 64 * 1024,
      ...options,
    });
    return {
      ok: true,
      stdout: sanitize(result?.stdout),
      stderr: sanitize(result?.stderr),
      code: 0,
    };
  } catch (error) {
    return {
      ok: false,
      stdout: sanitize(error?.stdout),
      stderr: sanitize(error?.stderr),
      code: Number.isInteger(error?.code) ? error.code : null,
    };
  }
}

export async function collectUniJuriRemoteSignerKeychainPreflight({
  execFn = execFileAsync,
  accessFn = access,
  platform = process.platform,
  arch = process.arch,
  nodePath = process.execPath,
} = {}) {
  const checks = [];

  checks.push({
    id: "platform",
    ok: platform === "darwin",
    detail: `${platform}/${arch}`,
  });

  try {
    await accessFn("/usr/bin/security");
    checks.push({ id: "security_binary", ok: true, detail: "/usr/bin/security" });
  } catch {
    checks.push({ id: "security_binary", ok: false, detail: "missing" });
  }

  checks.push({
    id: "node_runtime",
    ok: Boolean(nodePath),
    detail: sanitize(nodePath),
  });

  const keychain = await run(execFn, "/usr/bin/security", [
    "find-generic-password",
    "-s",
    UNIJURI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
    "-a",
    UNIJURI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
  ]);

  checks.push({
    id: "keychain_item_present",
    ok: keychain.ok,
    detail: keychain.ok ? "present" : "absent",
    advisory: true,
  });

  const hardFailures = checks.filter((check) => !check.advisory && !check.ok);

  return Object.freeze({
    mode: "dry-run-read-only",
    writesPerformed: false,
    safeToProvision: hardFailures.length === 0,
    planned: Object.freeze({
      keyId: UNIJURI_DELEGATED_BINDING_PLANNED_KEY_ID,
      algorithm: "RSA-PSS-SHA256",
      minimumRsaBits: 2048,
      secretRef: UNIJURI_REMOTE_SIGNER_SECRET_REF,
      purpose: UNIJURI_REMOTE_SIGNER_PURPOSE,
      keychainService: UNIJURI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
      keychainAccount: UNIJURI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
      centralPublicKeysEnv: "UNIJURI_DELEGATED_BINDING_PUBLIC_KEYS_JSON",
      centralBindingEnforcementEnv: "UNIJURI_DELEGATED_BINDING_ENFORCED",
      gatewaySignerModeEnv: "UNIJURI_DELEGATED_BINDING_SIGNER_MODE",
      gatewayRemoteEndpointEnv: "UNIJURI_DELEGATED_BINDING_REMOTE_SIGNER_ENDPOINT",
      gatewayKeyIdEnv: "UNIJURI_DELEGATED_BINDING_KEY_ID",
    }),
    checks: Object.freeze(checks.map((check) => Object.freeze({ ...check }))),
  });
}

export function assertUniJuriRemoteSignerKeychainPreflightIsReadOnly(result) {
  if (!result || result.mode !== "dry-run-read-only" || result.writesPerformed !== false) {
    throw new Error("unijuri_remote_signer_preflight_not_read_only");
  }
  return result;
}
