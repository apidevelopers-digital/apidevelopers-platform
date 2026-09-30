import { normalizeJurisprudenceProviderOutput } from "./mitra-jurisprudence-provider-readonly.mjs";

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_BASE_URL = "https://api-publica.datajud.cnj.jus.br";
const DEFAULT_TRIBUNAL = "stj";

const TRIBUNAL_ALIASES = Object.freeze({
  stj: "stj",
  tjsp: "tjsp",
  trf1: "trf1",
  trf2: "trf2",
  trf3: "trf3",
  trf4: "trf4",
  trf5: "trf5",
  trf6: "trf6",
  tst: "tst",
  tse: "tse",
  stm: "stm",
});

function safeText(value, max = 500) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, max);
}

function normalizeTimeoutMs(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_TIMEOUT_MS), 10);
  if (!Number.isFinite(parsed) || parsed < 100 || parsed > 60000) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

function normalizeBaseUrl(value) {
  const text = safeText(value ?? DEFAULT_BASE_URL, 500);
  if (!text) return undefined;
  const url = new URL(text);
  if (url.protocol !== "https:") throw new TypeError("datajud baseUrl must use https");
  return url;
}

function ensureAllowedHost(url, allowedHosts) {
  const hosts = Array.isArray(allowedHosts) ? allowedHosts.map((host) => String(host).toLowerCase()) : [];
  if (hosts.length === 0) throw new TypeError("datajud allowedHosts must not be empty when enabled");
  if (!hosts.includes(url.hostname.toLowerCase())) throw new TypeError("datajud baseUrl host is not allowed");
}

function normalizeTribunal(value) {
  const normalized = safeText(value, 40)?.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!normalized) return DEFAULT_TRIBUNAL;
  return TRIBUNAL_ALIASES[normalized] ?? normalized;
}

function buildEndpoint(baseUrl, tribunal) {
  return new URL(`/api_publica_${tribunal}/_search`, baseUrl);
}

function buildSearchBody(query) {
  const should = [
    { match: { numeroProcesso: query.q } },
    { match: { "classe.nome": query.q } },
    { match: { "assuntos.nome": query.q } },
    { match: { "movimentos.nome": query.q } },
  ];

  const filter = [];
  if (query.periodFrom || query.periodTo) {
    filter.push({
      range: {
        dataAjuizamento: {
          ...(query.periodFrom ? { gte: query.periodFrom } : {}),
          ...(query.periodTo ? { lte: query.periodTo } : {}),
        },
      },
    });
  }

  return Object.freeze({
    size: query.limit ?? 5,
    query: {
      bool: {
        should,
        minimum_should_match: 1,
        ...(filter.length > 0 ? { filter } : {}),
      },
    },
    sort: [{ dataAjuizamento: { order: "desc" } }],
  });
}

function firstName(items) {
  if (!Array.isArray(items)) return undefined;
  const first = items.find((item) => item?.nome);
  return safeText(first?.nome, 200);
}

function lastMovement(source) {
  const movements = Array.isArray(source?.movimentos) ? source.movimentos : [];
  const movement = movements[movements.length - 1];
  return safeText(movement?.nome, 300);
}

function normalizeHit(hit, tribunal) {
  const source = hit?._source ?? hit ?? {};
  const processNumber = safeText(source.numeroProcesso, 120);
  const court = safeText(source.tribunal, 80) ?? tribunal?.toUpperCase();
  const className = safeText(source.classe?.nome, 200);
  const judgingBody = safeText(source.orgaoJulgador?.nome, 200);
  const subject = firstName(source.assuntos);
  const movement = lastMovement(source);
  const date = safeText(source.dataAjuizamento, 40)?.slice(0, 10);

  return {
    ...(processNumber ? { id: processNumber } : {}),
    title: processNumber ? `Processo ${processNumber}` : "Processo DataJud",
    source: "DataJud/CNJ",
    ...(court ? { court } : {}),
    ...(date ? { date } : {}),
    summary: [className, judgingBody, subject, movement].filter(Boolean).join(" | ") || undefined,
  };
}

function normalizePayload(payload, tribunal) {
  const hits = Array.isArray(payload?.hits?.hits)
    ? payload.hits.hits
    : Array.isArray(payload?.hits)
      ? payload.hits
      : Array.isArray(payload?.results)
        ? payload.results
        : [];
  return hits.map((hit) => normalizeHit(hit, tribunal));
}

export function createDatajudJurisprudenceProvider({
  enabled = false,
  baseUrl = DEFAULT_BASE_URL,
  apiKey,
  allowedHosts = [],
  fetchFn = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!enabled) {
    return Object.freeze({
      id: "datajud",
      enabled: false,
      async search() {
        throw new Error("datajud_provider_disabled");
      },
    });
  }

  if (typeof fetchFn !== "function") throw new TypeError("datajud fetchFn must be a function");

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) throw new TypeError("datajud baseUrl is required when enabled");
  ensureAllowedHost(normalizedBaseUrl, allowedHosts);

  const normalizedApiKey = safeText(apiKey, 1000);
  if (!normalizedApiKey) throw new TypeError("datajud apiKey is required when enabled");

  const normalizedTimeoutMs = normalizeTimeoutMs(timeoutMs);

  return Object.freeze({
    id: "datajud",
    enabled: true,

    async search(query) {
      const tribunal = normalizeTribunal(query.tribunal);
      const requestUrl = buildEndpoint(normalizedBaseUrl, tribunal);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), normalizedTimeoutMs);

      try {
        const response = await fetchFn(requestUrl, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            authorization: `APIKey ${normalizedApiKey}`,
            "user-agent": "apidevelopers-platform/mitra-datajud-provider-readonly",
          },
          body: JSON.stringify(buildSearchBody(query)),
          signal: controller.signal,
        });

        if (!response?.ok) {
          throw new Error(`datajud_http_${response?.status ?? "unknown"}`);
        }

        const payload = await response.json();
        const results = normalizePayload(payload, tribunal);

        return Object.freeze({
          results: Object.freeze(normalizeJurisprudenceProviderOutput({ results }, query.limit ?? 5)),
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
