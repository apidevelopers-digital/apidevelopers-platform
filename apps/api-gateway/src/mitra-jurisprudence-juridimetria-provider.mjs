import { normalizeJurisprudenceProviderOutput } from "./mitra-jurisprudence-provider-readonly.mjs";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_PATH = "/jurisprudencia";

function safeText(value, max = 500) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, max);
}

function normalizeBaseUrl(value) {
  const text = safeText(value, 500);
  if (!text) return undefined;
  const url = new URL(text);
  if (url.protocol !== "https:") throw new TypeError("juridimetria baseUrl must use https");
  return url;
}

function ensureAllowedHost(url, allowedHosts) {
  const hosts = Array.isArray(allowedHosts) ? allowedHosts.map((host) => String(host).toLowerCase()) : [];
  if (hosts.length === 0) throw new TypeError("juridimetria allowedHosts must not be empty when enabled");
  if (!hosts.includes(url.hostname.toLowerCase())) throw new TypeError("juridimetria baseUrl host is not allowed");
}

function normalizeTimeoutMs(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_TIMEOUT_MS), 10);
  if (!Number.isFinite(parsed) || parsed < 100 || parsed > 15000) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

function appendQuery(url, query) {
  url.searchParams.set("q", query.q);
  if (query.tribunal) url.searchParams.set("tribunal", query.tribunal);
  if (query.periodFrom) url.searchParams.set("periodFrom", query.periodFrom);
  if (query.periodTo) url.searchParams.set("periodTo", query.periodTo);
  url.searchParams.set("limit", String(query.limit ?? 5));
  return url;
}

function normalizeResponsePayload(payload) {
  if (Array.isArray(payload)) return { results: payload };
  if (Array.isArray(payload?.results)) return { results: payload.results };
  if (Array.isArray(payload?.items)) return { results: payload.items };
  if (Array.isArray(payload?.data)) return { results: payload.data };
  return { results: [] };
}

export function createJuridimetriaJurisprudenceProvider({
  enabled = false,
  baseUrl,
  apiKey,
  allowedHosts = [],
  fetchFn = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!enabled) {
    return Object.freeze({
      id: "juridimetria",
      enabled: false,
      async search() {
        throw new Error("juridimetria_provider_disabled");
      },
    });
  }

  if (typeof fetchFn !== "function") throw new TypeError("juridimetria fetchFn must be a function");

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) throw new TypeError("juridimetria baseUrl is required when enabled");
  ensureAllowedHost(normalizedBaseUrl, allowedHosts);

  const normalizedApiKey = safeText(apiKey, 500);
  if (!normalizedApiKey) throw new TypeError("juridimetria apiKey is required when enabled");

  const normalizedTimeoutMs = normalizeTimeoutMs(timeoutMs);

  return Object.freeze({
    id: "juridimetria",
    enabled: true,

    async search(query) {
      const requestUrl = new URL(DEFAULT_PATH, normalizedBaseUrl);
      appendQuery(requestUrl, query);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), normalizedTimeoutMs);

      try {
        const response = await fetchFn(requestUrl, {
          method: "GET",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${normalizedApiKey}`,
            "user-agent": "apidevelopers-platform/mitra-juridimetria-provider-readonly",
          },
          signal: controller.signal,
        });

        if (!response?.ok) {
          throw new Error(`juridimetria_http_${response?.status ?? "unknown"}`);
        }

        const payload = await response.json();
        const normalizedPayload = normalizeResponsePayload(payload);
        return Object.freeze({
          results: Object.freeze(normalizeJurisprudenceProviderOutput(normalizedPayload, query.limit ?? 5)),
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
