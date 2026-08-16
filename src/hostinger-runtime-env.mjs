function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

export function resolveHostingerRuntimeEnv(env = process.env) {
  return Object.freeze({
    ...env,
    HOST: normalizeText(env.HOST) ?? "0.0.0.0",
    API_GATEWAY_STATE_FILE:
      normalizeText(env.API_GATEWAY_STATE_FILE) ?? ".runtime/gateway-state.json",
  });
}
