const DEFAULT_BASE_URL = "https://dadosabertos.camara.leg.br";
const INTERNAL_BASE_URL = "https://mitra-camara.internal";
const INTERNAL_SEARCH_URL = `${INTERNAL_BASE_URL}/search/global`;
const MAX_QUERY_LENGTH = 500;
const MAX_RESULTS = 20;
const MAX_RESPONSE_BYTES = 1_500_000;

export class MitraCamaraUpstreamError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "MitraCamaraUpstreamError";
    this.status = status;
    this.code = code;
  }
}

function normalizeQuery(value) {
  const query = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!query) {
    throw new MitraCamaraUpstreamError(400, "query_required", "Digite um termo para pesquisar.");
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new MitraCamaraUpstreamError(
      400,
      "query_too_long",
      `A pesquisa deve ter no máximo ${MAX_QUERY_LENGTH} caracteres.`,
    );
  }
  return query;
}

function clampLimit(value) {
  const numeric = Number(value ?? 8);
  if (!Number.isFinite(numeric)) return 8;
  return Math.max(1, Math.min(MAX_RESULTS, Math.floor(numeric)));
}

function normalizeBaseUrl(value) {
  const raw = String(value ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== "dadosabertos.camara.leg.br") {
    throw new TypeError("Câmara Dados Abertos base URL must use HTTPS on dadosabertos.camara.leg.br");
  }
  return url.toString().replace(/\/+$/, "");
}

function text(value, max = 2_000) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

function safeHttpsUrl(value) {
  const raw = text(value, 1_000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeProposal(row = {}) {
  const sigla = text(row.siglaTipo, 24);
  const numero = text(row.numero, 32);
  const ano = text(row.ano, 8);
  const designation = [sigla, numero && `${numero}/${ano || ""}`.replace(/\/$/, "")]
    .filter(Boolean)
    .join(" ")
    .trim();
  const summary = text(row.ementa || row.descricao || "", 2_000);
  const title = designation || summary.slice(0, 180) || "Proposição legislativa";
  const sourceUrl = safeHttpsUrl(row.uri);
  const citation = [designation, "Câmara dos Deputados", summary ? summary.slice(0, 220) : ""]
    .filter(Boolean)
    .join(". ");

  return Object.freeze({
    title: title.slice(0, 300),
    summary,
    source: "Câmara dos Deputados — Dados Abertos",
    source_url: sourceUrl,
    citation: citation.slice(0, 1_200),
    date: ano,
  });
}

function responseLike(status, payload) {
  return Object.freeze({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  });
}

function errorResponse(error) {
  if (error instanceof MitraCamaraUpstreamError) {
    return responseLike(error.status, {
      ok: false,
      error: error.code,
      message: error.message,
      write_executed: false,
    });
  }
  return responseLike(502, {
    ok: false,
    error: "camara_unavailable",
    message: "Não foi possível consultar os Dados Abertos da Câmara neste momento.",
    write_executed: false,
  });
}

export const MITRA_CAMARA_INTERNAL_UPSTREAM_BASE_URL = INTERNAL_BASE_URL;

export function createMitraPublicCamaraFetchAdapter({
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_BASE_URL,
  now = () => new Date(),
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  async function search({ query, limit, signal }) {
    const normalizedQuery = normalizeQuery(query);
    const safeLimit = clampLimit(limit);
    const url = new URL(`${normalizedBaseUrl}/api/v2/proposicoes`);
    url.searchParams.set("keywords", normalizedQuery);
    url.searchParams.set("itens", String(safeLimit));

    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": "API-Developers-Mitra/1.0 (+https://apidevelopers.digital)",
        },
        signal,
        redirect: "follow",
        cache: "no-store",
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new MitraCamaraUpstreamError(504, "camara_timeout", "A Câmara excedeu o tempo de resposta.");
      }
      throw new MitraCamaraUpstreamError(502, "camara_unavailable", "Não foi possível alcançar a API da Câmara.");
    }

    const contentType = response.headers?.get?.("content-type") ?? "";
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
      throw new MitraCamaraUpstreamError(
        502,
        "camara_response_too_large",
        "A resposta da Câmara excedeu o limite seguro.",
      );
    }

    if (!response.ok) {
      throw new MitraCamaraUpstreamError(
        response.status >= 500 ? 502 : 400,
        "camara_rejected",
        `A API da Câmara respondeu com HTTP ${response.status}.`,
      );
    }

    if (!contentType.toLowerCase().includes("json")) {
      throw new MitraCamaraUpstreamError(
        502,
        "camara_invalid_content_type",
        "A API da Câmara respondeu em formato inesperado.",
      );
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new MitraCamaraUpstreamError(
        502,
        "camara_invalid_json",
        "A API da Câmara retornou JSON inválido.",
      );
    }

    const rows = Array.isArray(payload?.dados) ? payload.dados : [];
    const results = rows.slice(0, safeLimit).map(normalizeProposal);

    return Object.freeze({
      ok: true,
      source: "Câmara dos Deputados — Dados Abertos",
      source_url: "https://dadosabertos.camara.leg.br/",
      results,
      total: results.length,
      confidence: results.length ? "media" : "baixa",
      legal_warning:
        "Pesquisa pública auxiliar em proposições legislativas; valide a tramitação e o texto oficial antes de qualquer decisão jurídica.",
      queried_at: now().toISOString(),
      write_executed: false,
    });
  }

  return Object.freeze({
    baseUrl: INTERNAL_BASE_URL,
    provider: "camara_dados_abertos",
    async fetch(input, options = {}) {
      try {
        const url = new URL(String(input), INTERNAL_BASE_URL);
        if (url.toString() !== INTERNAL_SEARCH_URL) {
          return responseLike(404, {
            ok: false,
            error: "not_found",
            message: "Rota interna da Câmara não encontrada.",
            write_executed: false,
          });
        }

        const method = String(options.method ?? "GET").toUpperCase();
        if (method !== "POST") {
          return responseLike(405, {
            ok: false,
            error: "method_not_allowed",
            message: "Método não permitido.",
            write_executed: false,
          });
        }

        let payload;
        try {
          payload = JSON.parse(String(options.body ?? "{}"));
        } catch {
          throw new MitraCamaraUpstreamError(400, "invalid_json", "Corpo JSON inválido.");
        }

        const result = await search({
          query: payload.q ?? payload.query,
          limit: payload.limit,
          signal: options.signal,
        });
        return responseLike(200, result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  });
}
