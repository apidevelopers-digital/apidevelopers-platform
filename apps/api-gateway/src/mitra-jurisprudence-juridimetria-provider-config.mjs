import { createJuridimetriaJurisprudenceProvider } from "./mitra-jurisprudence-juridimetria-provider.mjs";

const TRUE_VALUES = Object.freeze(new Set(["1", "true", "yes", "on", "enabled"]));

function safeText(value, max = 1000) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  return normalized.slice(0, max);
}

function isEnabled(value) {
  const text = safeText(value, 50);
  return TRUE_VALUES.has(text.toLowerCase());
}

function parseAllowedHosts(value) {
  const text = safeText(value, 2000);
  if (!text) return [];
  return Object.freeze(text
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean));
}

function readConfig(env = {}) {
  return Object.freeze({
    enabled: isEnabled(env.MITRA_JURIDIMETRIA_PROVIDER_ENABLED),
    baseUrl: safeText(env.MITRA_JURIDIMETRIA_BASE_URL, 500),
    apiKey: safeText(env.MITRA_JURIDIMETRIA_API_KEY, 500),
    allowedHosts: parseAllowedHosts(env.MITRA_JURIDIMETRIA_ALLOWED_HOSTS),
    timeoutMs: env.MITRA_JURIDIMETRIA_TIMEOUT_MS,
  });
}

export function getJuridimetriaJurisprudenceProviderConfigStatus(env = {}) {
  const config = readConfig(env);

  return Object.freeze({
    providerId: "juridimetria",
    enabled: config.enabled,
    baseUrlPresent: Boolean(config.baseUrl),
    apiKeyPresent: Boolean(config.apiKey),
    allowedHostCount: config.allowedHosts.length,
    timeoutMsPresent: config.timeoutMs !== undefined && config.timeoutMs !== null,
  });
}

export function createJuridimetriaJurisprudenceProviderFromEnv({
  env = process.env,
  fetchFn = globalThis.fetch,
} = {}) {
  const config = readConfig(env);

  return createJuridimetriaJurisprudenceProvider({
    enabled: config.enabled,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    allowedHosts: config.allowedHosts,
    fetchFn,
    timeoutMs: config.timeoutMs,
  });
}
