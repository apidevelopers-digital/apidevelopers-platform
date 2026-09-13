import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function resolveHostingerStateFile(env = process.env) {
  const configured =
    normalizeText(env.API_GATEWAY_STATE_FILE) ?? ".runtime/gateway-state.json";
  if (isAbsolute(configured)) return configured;

  const home = normalizeText(env.HOME);
  return home ? resolve(home, configured) : configured;
}

function isHostingerHome(home) {
  return /^\/home\/[^/]+$/.test(String(home ?? "").trim());
}

function resolveRuntimeHome(env = process.env, fallbackHome = homedir()) {
  return normalizeText(env.HOME) ?? fallbackHome;
}

function resolveUniAccountRuntimeCredentialFile(env = process.env, home = resolveRuntimeHome(env)) {
  const configured = normalizeText(env.UNI_CO_PREVIEW_RUNTIME_CREDENTIALS_FILE);
  if (configured) return isAbsolute(configured) ? configured : resolve(home, configured);
  if (!isHostingerHome(home)) return undefined;
  return resolve(
    home,
    "domains",
    "apidevelopers.digital",
    "uni-preview-account-runtime",
    "gateway.credentials.json",
  );
}

function requireBearer(value, name) {
  const normalized = normalizeText(value);
  if (!normalized || !normalized.startsWith("Bearer ") || normalized.length < 32) {
    throw new TypeError(`${name} must be a non-empty Bearer credential`);
  }
  return normalized;
}

function readUniAccountRuntimeCredentials({
  env = process.env,
  home = resolveRuntimeHome(env),
  readFileFn,
} = {}) {
  if (
    normalizeText(env.UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION) &&
    normalizeText(env.UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION)
  ) {
    return {};
  }

  if (typeof readFileFn !== "function") return {};

  const path = resolveUniAccountRuntimeCredentialFile(env, home);
  if (!path) return {};

  let raw;
  try {
    raw = readFileFn(path, "utf8");
  } catch {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TypeError("Uni.co preview S2S credential file is invalid");
  }

  return Object.freeze({
    UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION: requireBearer(
      parsed?.handoffRedeemerAuthorization,
      "handoffRedeemerAuthorization",
    ),
    UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION: requireBearer(
      parsed?.accessContextAuthorization,
      "accessContextAuthorization",
    ),
  });
}

export function resolveHostingerRuntimeEnv(
  env = process.env,
  { home = resolveRuntimeHome(env), readFileFn } = {},
) {
  const uniAccountCredentials = readUniAccountRuntimeCredentials({ env, home, readFileFn });
  return Object.freeze({
    ...env,
    ...uniAccountCredentials,
    HOST: normalizeText(env.HOST) ?? "0.0.0.0",
    API_GATEWAY_STATE_FILE: resolveHostingerStateFile(env),
  });
}
