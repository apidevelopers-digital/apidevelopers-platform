const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_QUERY_LENGTH = 500;
const MAX_LIMIT = 20;
const DEFAULT_ENDPOINT_PATH = "/v1/mitra/public/jurisprudencia";

export class PublicResearchError extends Error {
  constructor(code, message, { status = 0 } = {}) {
    super(message);
    this.name = "PublicResearchError";
    this.code = code;
    this.status = status;
  }
}

function cleanBaseUrl(value) {
  const raw = String(value ?? "").trim().replace(/\/+$/, "");
  if (!raw) return "";

  if (raw.startsWith("/")) return raw.replace(/\/+$/, "");

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new PublicResearchError("invalid_base_url", "Endpoint público inválido.");
  }

  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) {
    throw new PublicResearchError("insecure_base_url", "A pesquisa pública exige HTTPS.");
  }

  return url.toString().replace(/\/+$/, "");
}

function cleanEndpointPath(value) {
  const raw = String(value || DEFAULT_ENDPOINT_PATH).trim();
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  return normalized.replace(/\/+$/, "");
}

function toText(value, max = 2_000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function normalizeResult(item = {}) {
  const raw = item && typeof item === "object" ? item : {};
  const title = toText(raw.title || raw.titulo || raw.ementa || raw.id || "Resultado");
  const source = toText(raw.source || raw.fonte || "Fonte pública", 180);
  const court = toText(raw.court || raw.tribunal || "", 120);
  const date = toText(raw.date || raw.data || "", 80);
  const summary = toText(raw.summary || raw.resumo || raw.snippet || raw.description || "", 2_000);
  const sourceUrl = toText(raw.source_url || raw.sourceUrl || raw.url || "", 1_000);

  return Object.freeze({
    id: toText(raw.id || raw.identifier || "", 240),
    title,
    summary,
    source,
    sourceUrl,
    court,
    date,
    citation: [source, court, date].filter(Boolean).join(" · "),
  });
}

function normalizePayload(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const rows = Array.isArray(data.results)
    ? data.results
    : Array.isArray(data.items)
      ? data.items
      : [];

  return Object.freeze({
    ok: data.ok !== false,
    adapterId: toText(data.adapterId || data.adapter_id || "mitra.buscar_jurisprudencia", 180),
    source: toText(data.source || "Mitra Jurisprudência Pública", 180),
    results: Object.freeze(rows.slice(0, MAX_LIMIT).map(normalizeResult)),
    confidence: toText(data.confidence || "", 80),
    legalWarning: toText(data.legal_warning || data.legalWarning || "", 500),
    queriedAt: toText(data.queried_at || data.queriedAt || "", 100),
  });
}

function buildUrl(baseUrl, endpointPath, { query, tribunal, limit, periodFrom, periodTo }) {
  const normalizedBaseUrl = cleanBaseUrl(baseUrl);
  const normalizedEndpointPath = cleanEndpointPath(endpointPath);
  const url = new URL(`${normalizedBaseUrl}${normalizedEndpointPath}`, globalThis.location?.origin || "http://localhost");

  url.searchParams.set("q", query);
  if (tribunal) url.searchParams.set("tribunal", tribunal);
  if (periodFrom) url.searchParams.set("periodFrom", periodFrom);
  if (periodTo) url.searchParams.set("periodTo", periodTo);
  url.searchParams.set("limit", String(limit));

  if (!normalizedBaseUrl) {
    return `${normalizedEndpointPath}?${url.searchParams.toString()}`;
  }

  return url.toString();
}

export function createPublicResearchClient({
  baseUrl = "",
  endpointPath = DEFAULT_ENDPOINT_PATH,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const normalizedBaseUrl = cleanBaseUrl(baseUrl);
  const normalizedEndpointPath = cleanEndpointPath(endpointPath);

  return Object.freeze({
    configured: true,
    baseUrl: normalizedBaseUrl,
    endpointPath: normalizedEndpointPath,

    async search({
      query,
      tribunal = "STJ",
      limit = 8,
      periodFrom = "",
      periodTo = "",
    } = {}) {
      const normalizedQuery = String(query ?? "").trim();

      if (!normalizedQuery) {
        throw new PublicResearchError("query_required", "Digite um termo para pesquisar.", { status: 400 });
      }

      if (normalizedQuery.length > MAX_QUERY_LENGTH) {
        throw new PublicResearchError("query_too_long", "A pesquisa excede o limite permitido.", { status: 400 });
      }

      if (typeof fetchImpl !== "function") {
        throw new PublicResearchError("fetch_unavailable", "Transporte HTTP indisponível.", { status: 503 });
      }

      const safeLimit = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || 8));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));

      try {
        const response = await fetchImpl(buildUrl(normalizedBaseUrl, normalizedEndpointPath, {
          query: normalizedQuery,
          tribunal: toText(tribunal, 40) || "STJ",
          limit: safeLimit,
          periodFrom: toText(periodFrom, 40),
          periodTo: toText(periodTo, 40),
        }), {
          method: "GET",
          headers: {
            accept: "application/json",
          },
          signal: controller.signal,
          credentials: "omit",
          cache: "no-store",
        });

        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const code = toText(payload?.error || payload?.code || "public_research_failed", 120);
          const message = toText(payload?.message || payload?.detail || "A pesquisa pública não respondeu como esperado.", 500);
          throw new PublicResearchError(code, message, { status: response.status });
        }

        return normalizePayload(payload);
      } catch (error) {
        if (error instanceof PublicResearchError) throw error;
        if (error?.name === "AbortError") {
          throw new PublicResearchError("timeout", "A pesquisa pública demorou mais que o esperado.", { status: 504 });
        }
        throw new PublicResearchError("network_error", "Não foi possível alcançar a pesquisa pública.", { status: 503 });
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
