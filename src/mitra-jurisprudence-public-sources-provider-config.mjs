import { createDatajudJurisprudenceProvider } from "./mitra-jurisprudence-datajud-provider.mjs";
import { createLexmlJurisprudenceProvider } from "./mitra-jurisprudence-lexml-provider.mjs";
import { createPublicSourcesJurisprudenceProvider } from "./mitra-jurisprudence-public-sources-provider.mjs";

const TRUE_VALUES = Object.freeze(new Set(["1", "true", "yes", "on", "enabled"]));

function safeText(value, max = 1000) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  return normalized.slice(0, max);
}

function isEnabled(value) {
  const text = safeText(value, 50);
  if (!text) return false;
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
    lexml: Object.freeze({
      enabled: isEnabled(env.MITRA_LEXML_PROVIDER_ENABLED),
      sruUrl: safeText(env.MITRA_LEXML_SRU_URL, 500),
      allowedHosts: parseAllowedHosts(env.MITRA_LEXML_ALLOWED_HOSTS),
      timeoutMs: env.MITRA_LEXML_TIMEOUT_MS,
    }),
    datajud: Object.freeze({
      enabled: isEnabled(env.MITRA_DATAJUD_PROVIDER_ENABLED),
      baseUrl: safeText(env.MITRA_DATAJUD_BASE_URL, 500),
      apiKey: safeText(env.MITRA_DATAJUD_API_KEY, 1000),
      allowedHosts: parseAllowedHosts(env.MITRA_DATAJUD_ALLOWED_HOSTS),
      timeoutMs: env.MITRA_DATAJUD_TIMEOUT_MS,
    }),
  });
}

export function getPublicJurisprudenceProviderConfigStatus(env = {}) {
  const config = readConfig(env);

  return Object.freeze({
    providerId: "public-sources",
    enabled: config.lexml.enabled || config.datajud.enabled,
    lexml: Object.freeze({
      enabled: config.lexml.enabled,
      sruUrlPresent: Boolean(config.lexml.sruUrl),
      allowedHostCount: config.lexml.allowedHosts.length,
      timeoutMsPresent: config.lexml.timeoutMs !== undefined && config.lexml.timeoutMs !== null,
    }),
    datajud: Object.freeze({
      enabled: config.datajud.enabled,
      baseUrlPresent: Boolean(config.datajud.baseUrl),
      apiKeyPresent: Boolean(config.datajud.apiKey),
      allowedHostCount: config.datajud.allowedHosts.length,
      timeoutMsPresent: config.datajud.timeoutMs !== undefined && config.datajud.timeoutMs !== null,
    }),
  });
}

export function createPublicJurisprudenceProviderFromEnv({
  env = process.env,
  fetchFn = globalThis.fetch,
} = {}) {
  const config = readConfig(env);
  const providers = [];

  if (config.lexml.enabled) {
    providers.push(createLexmlJurisprudenceProvider({
      enabled: true,
      sruUrl: config.lexml.sruUrl,
      allowedHosts: config.lexml.allowedHosts,
      fetchFn,
      timeoutMs: config.lexml.timeoutMs,
    }));
  }

  if (config.datajud.enabled) {
    providers.push(createDatajudJurisprudenceProvider({
      enabled: true,
      baseUrl: config.datajud.baseUrl,
      apiKey: config.datajud.apiKey,
      allowedHosts: config.datajud.allowedHosts,
      fetchFn,
      timeoutMs: config.datajud.timeoutMs,
    }));
  }

  return createPublicSourcesJurisprudenceProvider({ providers });
}
