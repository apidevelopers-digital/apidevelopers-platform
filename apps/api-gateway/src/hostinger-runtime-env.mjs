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

function requireHttpUrl(value, name) {
  const normalized = normalizeText(value);
  if (!normalized) throw new TypeError(`${name} must be a non-empty URL`);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new TypeError(`${name} must be a valid URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new TypeError(`${name} must be an http(s) URL`);
  }
  return normalized;
}

function readUniAccountRuntimeCredentials({
  env = process.env,
  home = resolveRuntimeHome(env),
  readFileFn,
} = {}) {
  const explicitIdentityBackendBaseUrl = normalizeText(env.UNI_CO_PREVIEW_IDENTITY_BACKEND_BASE_URL);
  const explicitHandoffRedeemerAuthorization = normalizeText(env.UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION);
  const explicitAccessContextAuthorization = normalizeText(env.UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION);

  if (
    explicitIdentityBackendBaseUrl &&
    explicitHandoffRedeemerAuthorization &&
    explicitAccessContextAuthorization
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

  const resolved = {};

  if (!explicitIdentityBackendBaseUrl) {
    const identityBackendBaseUrl =
      parsed?.identityBackendBaseUrl ?? parsed?.identityBackendUrl ?? parsed?.baseUrl;
    if (normalizeText(identityBackendBaseUrl)) {
      resolved.UNI_CO_PREVIEW_IDENTITY_BACKEND_BASE_URL = requireHttpUrl(
        identityBackendBaseUrl,
        "identityBackendBaseUrl",
      );
    }
  }

  if (!explicitHandoffRedeemerAuthorization) {
    resolved.UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION = requireBearer(
      parsed?.handoffRedeemerAuthorization,
      "handoffRedeemerAuthorization",
    );
  }

  if (!explicitAccessContextAuthorization) {
    resolved.UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION = requireBearer(
      parsed?.accessContextAuthorization,
      "accessContextAuthorization",
    );
  }

  return Object.freeze(resolved);
}

export function resolveHostingerRuntimeEnv(
  env = process.env,
  { home = resolveRuntimeHome(env), readFileFn } = {},
) {
  const uniAccountCredentials = readUniAccountRuntimeCredentials({ env, home, readFileFn });
  return Object.freeze({
    ...env,
    ...uniAccountCredentials,
    ...(normalizeText(env.UNI_CO_PREVIEW_IDENTITY_BACKEND_BASE_URL)
      ? { UNI_CO_PREVIEW_IDENTITY_BACKEND_BASE_URL: normalizeText(env.UNI_CO_PREVIEW_IDENTITY_BACKEND_BASE_URL) }
      : {}),
    ...(normalizeText(env.UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION)
      ? { UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION: normalizeText(env.UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION) }
      : {}),
    ...(normalizeText(env.UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION)
      ? { UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION: normalizeText(env.UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION) }
      : {}),
    HOST: normalizeText(env.HOST) ?? "0.0.0.0",
    API_GATEWAY_STATE_FILE: resolveHostingerStateFile(env),
  });
}
