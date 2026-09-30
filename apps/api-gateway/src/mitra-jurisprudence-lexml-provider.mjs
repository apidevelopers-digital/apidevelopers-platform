import { normalizeJurisprudenceProviderOutput } from "./mitra-jurisprudence-provider-readonly.mjs";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_SRU_URL = "https://www.lexml.gov.br/busca/SRU";

function safeText(value, max = 500) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, max);
}

function normalizeTimeoutMs(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_TIMEOUT_MS), 10);
  if (!Number.isFinite(parsed) || parsed < 100 || parsed > 30000) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

function normalizeSruUrl(value) {
  const text = safeText(value ?? DEFAULT_SRU_URL, 500);
  if (!text) return undefined;
  const url = new URL(text);
  if (url.protocol !== "https:") throw new TypeError("lexml sruUrl must use https");
  return url;
}

function ensureAllowedHost(url, allowedHosts) {
  const hosts = Array.isArray(allowedHosts) ? allowedHosts.map((host) => String(host).toLowerCase()) : [];
  if (hosts.length === 0) throw new TypeError("lexml allowedHosts must not be empty when enabled");
  if (!hosts.includes(url.hostname.toLowerCase())) throw new TypeError("lexml sruUrl host is not allowed");
}

function xmlDecode(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function stripTags(value = "") {
  return xmlDecode(String(value).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function tagValue(record, localName, max = 500) {
  const pattern = new RegExp(`<[^>]*:?${localName}\\b[^>]*>([\\s\\S]*?)<\\/[^>]*:?${localName}>`, "i");
  const match = pattern.exec(record);
  if (!match) return undefined;
  return safeText(stripTags(match[1]), max);
}

function recordChunks(xml) {
  const chunks = [];
  const recordPattern = /<[^>]*:?record\b[^>]*>([\s\S]*?)<\/[^>]*:?record>/gi;
  let match;
  while ((match = recordPattern.exec(xml))) chunks.push(match[1]);
  return chunks;
}

function normalizeLexmlRecord(record) {
  const title = tagValue(record, "title", 300);
  const identifier = tagValue(record, "identifier", 500);
  const source = tagValue(record, "source", 120) ?? "LexML";
  const date = tagValue(record, "date", 40);
  const description = tagValue(record, "description", 1000);
  const type = tagValue(record, "type", 120);
  const subject = tagValue(record, "subject", 200);

  return {
    ...(identifier ? { id: identifier } : {}),
    ...(title ? { title } : {}),
    source: "LexML",
    ...(identifier?.startsWith("http") ? { url: identifier } : {}),
    ...(source && source !== "LexML" ? { court: source } : {}),
    ...(date ? { date } : {}),
    summary: [description, type, subject].filter(Boolean).join(" | ") || undefined,
  };
}

function buildLexmlUrl(sruUrl, query) {
  const requestUrl = new URL(sruUrl);
  requestUrl.searchParams.set("operation", "searchRetrieve");
  requestUrl.searchParams.set("version", "1.1");
  requestUrl.searchParams.set("query", query.q);
  requestUrl.searchParams.set("startRecord", "1");
  requestUrl.searchParams.set("maximumRecords", String(query.limit ?? 5));
  return requestUrl;
}

export function createLexmlJurisprudenceProvider({
  enabled = false,
  sruUrl = DEFAULT_SRU_URL,
  allowedHosts = [],
  fetchFn = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!enabled) {
    return Object.freeze({
      id: "lexml",
      enabled: false,
      async search() {
        throw new Error("lexml_provider_disabled");
      },
    });
  }

  if (typeof fetchFn !== "function") throw new TypeError("lexml fetchFn must be a function");

  const normalizedSruUrl = normalizeSruUrl(sruUrl);
  if (!normalizedSruUrl) throw new TypeError("lexml sruUrl is required when enabled");
  ensureAllowedHost(normalizedSruUrl, allowedHosts);

  const normalizedTimeoutMs = normalizeTimeoutMs(timeoutMs);

  return Object.freeze({
    id: "lexml",
    enabled: true,

    async search(query) {
      const requestUrl = buildLexmlUrl(normalizedSruUrl, query);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), normalizedTimeoutMs);

      try {
        const response = await fetchFn(requestUrl, {
          method: "GET",
          headers: {
            accept: "application/xml,text/xml;q=0.9,*/*;q=0.1",
            "user-agent": "apidevelopers-platform/mitra-lexml-provider-readonly",
          },
          signal: controller.signal,
        });

        if (!response?.ok) {
          throw new Error(`lexml_http_${response?.status ?? "unknown"}`);
        }

        const text = await response.text();
        const trimmed = String(text ?? "").trim();
        if (!trimmed.startsWith("<") || /<html\b/i.test(trimmed)) {
          throw new Error("lexml_non_xml_response");
        }

        const results = recordChunks(trimmed)
          .map(normalizeLexmlRecord)
          .filter((result) => Object.keys(result).length > 0);

        return Object.freeze({
          results: Object.freeze(normalizeJurisprudenceProviderOutput({ results }, query.limit ?? 5)),
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
