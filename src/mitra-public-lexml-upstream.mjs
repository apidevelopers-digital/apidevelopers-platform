const DEFAULT_SRU_URL = "https://www.lexml.gov.br/busca/SRU";
const INTERNAL_BASE_URL = "https://mitra-lexml.internal";
const INTERNAL_SEARCH_URL = `${INTERNAL_BASE_URL}/search/global`;
const MAX_QUERY_LENGTH = 500;
const MAX_RESULTS = 20;
const MAX_RESPONSE_BYTES = 1_500_000;

export class MitraLexmlUpstreamError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "MitraLexmlUpstreamError";
    this.status = status;
    this.code = code;
  }
}

function clampLimit(value) {
  const numeric = Number(value ?? 8);
  if (!Number.isFinite(numeric)) return 8;
  return Math.max(1, Math.min(MAX_RESULTS, Math.floor(numeric)));
}

function normalizeQuery(value) {
  const query = String(value ?? "").trim();
  if (!query) {
    throw new MitraLexmlUpstreamError(400, "query_required", "Digite um termo para pesquisar.");
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new MitraLexmlUpstreamError(
      400,
      "query_too_long",
      `A pesquisa deve ter no máximo ${MAX_QUERY_LENGTH} caracteres.`,
    );
  }
  return query;
}

function escapeCql(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '""');
}

export function buildLexmlCql(query) {
  const safe = escapeCql(normalizeQuery(query));
  return `dc.title any "${safe}" or dc.subject any "${safe}" or dc.description any "${safe}"`;
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(xml, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = xml.match(
      new RegExp(`<(?:[\\w.-]+:)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escaped}>`, "i"),
    );
    if (match) return decodeXml(match[1]);
  }
  return "";
}

function detectChallenge(contentType, body) {
  const prefix = String(body ?? "").slice(0, 20_000).toLowerCase();
  return (
    String(contentType ?? "").toLowerCase().includes("text/html") ||
    prefix.includes("<!doctype html") ||
    prefix.includes("<html") ||
    prefix.includes("verificando sua conexão") ||
    prefix.includes("verificando sua conexao") ||
    prefix.includes("javascript is required") ||
    prefix.includes("enable javascript")
  );
}

function safeLexmlUrnUrl(urn) {
  const value = String(urn ?? "").trim();
  if (!value.toLowerCase().startsWith("urn:lex:")) return "";
  return `https://www.lexml.gov.br/urn/${encodeURIComponent(value)}`;
}

function extractUrn(xml) {
  const explicit = tagValue(xml, ["urn"]);
  if (explicit.toLowerCase().startsWith("urn:lex:")) return explicit;

  const identifiers = [
    ...xml.matchAll(/<(?:[\w.-]+:)?identifier\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?identifier>/gi),
  ].map((match) => decodeXml(match[1]));
  const fromIdentifier = identifiers.find((value) => value.toLowerCase().startsWith("urn:lex:"));
  if (fromIdentifier) return fromIdentifier;

  const direct = decodeXml(xml).match(/\burn:lex:br:[^\s<>"']+/i);
  return direct?.[0] ?? "";
}

function parseRecord(recordXml, index) {
  const title =
    tagValue(recordXml, ["title", "titulo"]) ||
    `Resultado LexML ${index + 1}`;
  const summary = tagValue(recordXml, ["description", "ementa", "resumo"]);
  const date = tagValue(recordXml, ["date", "data"]);
  const authority = tagValue(recordXml, ["creator", "autoridade"]);
  const documentType = tagValue(recordXml, ["type", "tipoDocumento"]);
  const locality = tagValue(recordXml, ["coverage", "localidade"]);
  const urn = extractUrn(recordXml);
  const sourceUrl = safeLexmlUrnUrl(urn);

  const citation = [title, authority, documentType, date, urn]
    .filter(Boolean)
    .join(". ");

  return Object.freeze({
    title: title.slice(0, 300),
    summary: summary.slice(0, 2_000),
    source: "LexML",
    source_url: sourceUrl,
    citation: citation.slice(0, 1_200),
    date: date.slice(0, 100),
    raw: Object.freeze({
      urn: urn.slice(0, 800),
      authority: authority.slice(0, 300),
      document_type: documentType.slice(0, 200),
      locality: locality.slice(0, 200),
    }),
  });
}

function parseSruXml(body, limit) {
  if (!/<(?:[\w.-]+:)?searchRetrieveResponse\b/i.test(body)) {
    throw new MitraLexmlUpstreamError(
      502,
      "lexml_invalid_xml",
      "O LexML respondeu sem um envelope SRU reconhecível.",
    );
  }

  const records = [
    ...body.matchAll(
      /<(?:[\w.-]+:)?record\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?record>/gi,
    ),
  ]
    .slice(0, limit)
    .map((match, index) => parseRecord(match[1], index));

  const totalRaw = tagValue(body, ["numberOfRecords"]);
  const total = Number.parseInt(totalRaw, 10);

  return Object.freeze({
    results: Object.freeze(records),
    total: Number.isFinite(total) ? total : records.length,
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
  if (error instanceof MitraLexmlUpstreamError) {
    return responseLike(error.status, {
      ok: false,
      error: error.code,
      message: error.message,
      write_executed: false,
    });
  }
  return responseLike(502, {
    ok: false,
    error: "lexml_unavailable",
    message: "Não foi possível consultar o LexML neste momento.",
    write_executed: false,
  });
}

function normalizeSruUrl(value) {
  const raw = String(value ?? DEFAULT_SRU_URL).trim();
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== "www.lexml.gov.br") {
    throw new TypeError("LexML SRU URL must be HTTPS on www.lexml.gov.br");
  }
  return url.toString();
}

export const MITRA_LEXML_INTERNAL_UPSTREAM_BASE_URL = INTERNAL_BASE_URL;

export function createMitraPublicLexmlFetchAdapter({
  fetchImpl = globalThis.fetch,
  sruUrl = DEFAULT_SRU_URL,
  now = () => new Date(),
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }

  const normalizedSruUrl = normalizeSruUrl(sruUrl);

  async function search({ query, limit, signal }) {
    const normalizedQuery = normalizeQuery(query);
    const safeLimit = clampLimit(limit);
    const url = new URL(normalizedSruUrl);
    url.searchParams.set("operation", "searchRetrieve");
    url.searchParams.set("version", "1.2");
    url.searchParams.set("query", buildLexmlCql(normalizedQuery));
    url.searchParams.set("startRecord", "1");
    url.searchParams.set("maximumRecords", String(safeLimit));
    url.searchParams.set("recordSchema", "dc");

    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/xml,text/xml;q=0.9,*/*;q=0.1",
          "user-agent": "API-Developers-Mitra/1.0 (+https://apidevelopers.digital)",
        },
        signal,
        redirect: "follow",
        cache: "no-store",
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new MitraLexmlUpstreamError(504, "lexml_timeout", "O LexML excedeu o tempo de resposta.");
      }
      throw new MitraLexmlUpstreamError(502, "lexml_unavailable", "Não foi possível alcançar o LexML.");
    }

    const body = await response.text();
    const bytes = Buffer.byteLength(body, "utf8");
    if (bytes > MAX_RESPONSE_BYTES) {
      throw new MitraLexmlUpstreamError(
        502,
        "lexml_response_too_large",
        "A resposta do LexML excedeu o limite seguro.",
      );
    }

    const contentType = response.headers?.get?.("content-type") ?? "";
    if (detectChallenge(contentType, body)) {
      throw new MitraLexmlUpstreamError(
        503,
        "lexml_challenge",
        "O LexML devolveu uma página de verificação em vez de dados SRU.",
      );
    }

    if (!response.ok) {
      throw new MitraLexmlUpstreamError(
        response.status >= 500 ? 502 : 400,
        "lexml_rejected",
        `O LexML respondeu com HTTP ${response.status}.`,
      );
    }

    const parsed = parseSruXml(body, safeLimit);
    return Object.freeze({
      ok: true,
      source: "LexML",
      source_url: "https://www.lexml.gov.br/busca/",
      results: parsed.results,
      total: parsed.total,
      confidence: parsed.results.length ? "media" : "baixa",
      legal_warning:
        "Pesquisa pública auxiliar; valide a fonte e revise profissionalmente antes de qualquer decisão.",
      queried_at: now().toISOString(),
      write_executed: false,
    });
  }

  return Object.freeze({
    baseUrl: INTERNAL_BASE_URL,
    provider: "lexml_sru",
    async fetch(input, options = {}) {
      try {
        const url = new URL(String(input), INTERNAL_BASE_URL);
        if (url.toString() !== INTERNAL_SEARCH_URL) {
          return responseLike(404, {
            ok: false,
            error: "not_found",
            message: "Rota interna LexML não encontrada.",
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
          throw new MitraLexmlUpstreamError(400, "invalid_json", "Corpo JSON inválido.");
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
