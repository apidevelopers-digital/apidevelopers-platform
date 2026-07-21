const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export const PORTAL_CONFIG = Object.freeze({
  environment: "development",
  defaultGatewayUrl: "http://127.0.0.1:3000",
  allowedGatewayOrigins: Object.freeze(["http://127.0.0.1:3000"]),
  timeoutMs: 8000,
});

export function validateGatewayUrl(input, config = PORTAL_CONFIG) {
  let url;
  try {
    url = new URL(String(input || ""));
  } catch {
    return { ok: false, code: "GATEWAY_URL_INVALID", url: null };
  }

  if (url.username || url.password) {
    return { ok: false, code: "GATEWAY_CREDENTIALS_FORBIDDEN", url: null };
  }
  if (url.search || url.hash) {
    return { ok: false, code: "GATEWAY_SUFFIX_FORBIDDEN", url: null };
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    return { ok: false, code: "GATEWAY_PATH_FORBIDDEN", url: null };
  }

  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  const protocolAllowed = url.protocol === "https:" || (loopback && url.protocol === "http:");
  if (!protocolAllowed) {
    return { ok: false, code: "GATEWAY_PROTOCOL_FORBIDDEN", url: null };
  }

  const allowed = Array.isArray(config.allowedGatewayOrigins)
    ? config.allowedGatewayOrigins
    : [];
  if (!allowed.includes(url.origin)) {
    return { ok: false, code: "GATEWAY_ORIGIN_FORBIDDEN", url: null };
  }

  return {
    ok: true,
    code: "GATEWAY_OK",
    url: url.origin,
  };
}

export function resolvePortalConfig(overrides = {}) {
  const merged = {
    ...PORTAL_CONFIG,
    ...overrides,
  };

  const timeoutMs = Number.isFinite(merged.timeoutMs)
    ? Math.min(Math.max(merged.timeoutMs, 1000), 30000)
    : PORTAL_CONFIG.timeoutMs;

  const validation = validateGatewayUrl(merged.defaultGatewayUrl, merged);
  return {
    environment: String(merged.environment || "unknown"),
    defaultGatewayUrl: validation.ok ? validation.url : "",
    allowedGatewayOrigins: Object.freeze([...(merged.allowedGatewayOrigins || [])]),
    timeoutMs,
    valid: validation.ok,
    errorCode: validation.ok ? null : validation.code,
  };
}
