const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_QUERY_LENGTH = 500;
const MAX_LIMIT = 20;

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

function toText(value, max = 2_000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function normalizeResult(item = {}) {
  const raw = item && typeof item === "object" ? item : {};
  return Object.freeze({
    title: toText(raw.title || raw.titulo || raw.ementa || "Resultado"),
    summary: toText(raw.summary || raw.resumo || raw.snippet || raw.description || ""),
    source: toText(raw.source || raw.fonte || "Fonte pública", 180),
    sourceUrl: toText(raw.source_url || raw.sourceUrl || raw.url || "", 1_000),
    citation: toText(raw.citation || raw.citacao || raw.reference || "", 1_000),
    date: toText(raw.date || raw.data || "", 80),
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
    source: toText(data.source || "Mitra Public Research", 180),
    results: Object.freeze(rows.slice(0, MAX_LIMIT).map(normalizeResult)),
    confidence: toText(data.confidence || "", 80),
    legalWarning: toText(data.legal_warning || data.legalWarning || "", 500),
    queriedAt: toText(data.queried_at || data.queriedAt || "", 100),
  });
}

export function createPublicResearchClient({
  baseUrl = "",
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const normalizedBaseUrl = cleanBaseUrl(baseUrl);

  return Object.freeze({
    configured: Boolean(normalizedBaseUrl),
    baseUrl: normalizedBaseUrl,

    async search({ query, limit = 8 } = {}) {
      const normalizedQuery = String(query ?? "").trim();

      if (!normalizedBaseUrl) {
        throw new PublicResearchError(
          "not_configured",
          "A pesquisa jurídica pública ainda não está conectada neste ambiente.",
          { status: 503 },
        );
      }

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
        const response = await fetchImpl(`${normalizedBaseUrl}/v1/mitra/public/search`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "accept": "application/json",
          },
          body: JSON.stringify({ query: normalizedQuery, limit: safeLimit }),
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
