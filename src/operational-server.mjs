import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { runOperationalMain } from "./operational-server-base.mjs";

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function requireBearer(value, name) {
  const normalized = optionalText(value);
  if (!normalized || !normalized.startsWith("Bearer ") || normalized.length < 32) {
    throw new TypeError(`${name} must be a non-empty Bearer credential`);
  }
  return normalized;
}

export function resolveUniCoPreviewCredentialFilePath({
  env = process.env,
  home = homedir(),
} = {}) {
  return (
    optionalText(env.UNI_CO_PREVIEW_RUNTIME_CREDENTIALS_FILE) ??
    resolve(
      home,
      "domains",
      "apidevelopers.digital",
      "uni-preview-account-runtime",
      "gateway.credentials.json",
    )
  );
}

export async function resolveUniCoPreviewOperationalEnv({
  env = process.env,
  home = homedir(),
  readFileFn = readFile,
} = {}) {
  const handoffFromEnv = optionalText(env.UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION);
  const accessFromEnv = optionalText(env.UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION);

  if (Boolean(handoffFromEnv) !== Boolean(accessFromEnv)) {
    throw new TypeError("Uni.co preview S2S credentials must be configured as a pair");
  }

  if (handoffFromEnv && accessFromEnv) {
    return Object.freeze({ ...env });
  }

  const credentialFilePath = resolveUniCoPreviewCredentialFilePath({ env, home });
  let raw;
  try {
    raw = await readFileFn(credentialFilePath, "utf8");
  } catch {
    throw new TypeError("Uni.co preview S2S credential file is unavailable");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TypeError("Uni.co preview S2S credential file is invalid");
  }

  const handoffRedeemerAuthorization = requireBearer(
    parsed?.handoffRedeemerAuthorization,
    "handoffRedeemerAuthorization",
  );
  const accessContextAuthorization = requireBearer(
    parsed?.accessContextAuthorization,
    "accessContextAuthorization",
  );

  return Object.freeze({
    ...env,
    UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION: handoffRedeemerAuthorization,
    UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION: accessContextAuthorization,
  });
}

export async function runUniCoPreviewOperationalMain({
  env = process.env,
  home = homedir(),
  readFileFn = readFile,
  runner = runOperationalMain,
} = {}) {
  const runtimeEnv = await resolveUniCoPreviewOperationalEnv({env, home, readFileFn });
  return runner({ env: runtimeEnv });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runUniCoPreviewOperationalMain().catch((error) => {
    console.error(JSON.stringify({
      event: "uni_co_preview_operational_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    }));
    process.exitCode = 1;
  });
}
