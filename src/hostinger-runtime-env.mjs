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

export function resolveHostingerRuntimeEnv(env = process.env) {
  return Object.freeze({
    ...env,
    HOST: normalizeText(env.HOST) ?? "0.0.0.0",
    API_GATEWAY_STATE_FILE: resolveHostingerStateFile(env),
  });
}
