import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";

import {
  ZUNI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
  ZUNI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
} from "./saas-delegated-binding-remote-signer-keychain.mjs";
import { ZUNI_REMOTE_SIGNER_LAUNCHD_LABEL } from "./saas-delegated-binding-remote-signer-launchd.mjs";

const execFileAsync = promisify(execFile);

function sanitize(value) {
  const text = String(value ?? "");
  return text
    .replace(/-----BEGIN [^-]+-----[\\s\\S]*?-----END [^-]+-----/g, "[REDACTED_PEM]")
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

export async function collectZuniRemoteSignerMacosPreflight({
  execFn = execFileAsync,
  accessFn = access,
  uid = typeof process.getuid === "function" ? process.getuid() : null,
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

  try {
    await accessFn("/bin/launchctl");
    checks.push({ id: "launchctl_binary", ok: true, detail: "/bin/launchctl" });
  } catch {
    checks.push({ id: "launchctl_binary", ok: false, detail: "missing" });
  }

  checks.push({
    id: "node_runtime",
    ok: Boolean(nodePath),
    detail: sanitize(nodePath),
  });

  const keychain = await run(execFn, "/usr/bin/security", [
    "find-generic-password",
    "-s",
    ZUNI_REMOTE_SIGNER_KEYCHAIN_SERVICE,
    "-a",
    ZUNI_REMOTE_SIGNER_KEYCHAIN_ACCOUNT,
  ]);
  checks.push({
    id: "test_keychain_item_present",
    ok: keychain.ok,
    detail: keychain.ok ? "present" : "absent",
    advisory: true,
  });

  const launchdTarget = uid === null ? null : `gui/${uid}/${ZUNI_REMOTE_SIGNER_LAUNCHD_LABEL}`;
  if (launchdTarget) {
    const launchd = await run(execFn, "/bin/launchctl", ["print", launchdTarget]);
    checks.push({
      id: "test_launchd_service_loaded",
      ok: launchd.ok,
      detail: launchd.ok ? "loaded" : "not_loaded",
      advisory: true,
    });
  } else {
    checks.push({
      id: "test_launchd_service_loaded",
      ok: false,
      detail: "uid_unavailable",
      advisory: true,
    });
  }

  const power = await run(execFn, "/usr/bin/pmset", ["-g", "custom"]);
  checks.push({
    id: "power_settings_readable",
    ok: power.ok,
    detail: power.ok ? "readable" : "unavailable",
  });

  const hardFailures = checks.filter((check) => !check.advisory && !check.ok);

  return Object.freeze({
    mode: "dry-run-read-only",
    writesPerformed: false,
    safeToPrepareLocalTest: hardFailures.length === 0,
    checks: Object.freeze(checks.map((check) => Object.freeze({ ...check }))),
  });
}

export function assertZuniRemoteSignerMacosPreflightIsReadOnly(result) {
  if (!result || result.mode !== "dry-run-read-only" || result.writesPerformed !== false) {
    throw new Error("remote_signer_preflight_not_read_only");
  }
  return result;
}
