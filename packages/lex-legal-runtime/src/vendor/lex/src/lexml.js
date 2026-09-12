const BASE = "https://www.lexml.gov.br";
const SRU = `${BASE}/busca/SRU`;
const UA = "lex-legal-api/1.2.1 (+https://github.com/apidevelopers-digital/lex-legal-api; read-only)";

function decode(value = "") {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripXml(value = "") {
  return decode(String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function values(xml, tag) {
  const safe = String(tag).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${safe}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${safe}>`, "gi");
  const out = [];
  let m;
  while ((m = rx.exec(String(xml)))) {
    const v = stripXml(m[1]);
    if (v) out.push(v);
  }
  return out;
}

function first(xml, tag) {
  return values(xml, tag)[0] || null;
}

function urnUrl(urn) {
  return urn ? `${BASE}/urn/${encodeURIComponent(urn)}` : null;
}

function quote(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function compact(query = "") {
  const stop = new Set(["quais","qual","sao","são","os","as","o","a","de","da","do","das","dos","pela","pelo","para","por","nos","nas","no","na","em","que","e","ou","uma","um","como"]);
  const tokens = String(query).normalize("NFC").replace(/[^\p{L}\p{N}.]+/gu, " ").trim().split(/\s+/).filter(Boolean)
    .filter(t => !stop.has(t.toLowerCase())).filter(t => t.length >= 3 || /^\d+$/.test(t));
  return [...new Map(tokens.map(t => [t.toLowerCase(), t])).values()].slice(-10).join(" ");
}

function plan(query = "") {
  const q = String(query).trim();
  const out = [q];
  const c = compact(q);
  if (c && c !== q) out.push(c);
  const lower = q.toLowerCase();
  if (lower.includes("tutela") && lower.includes("urg")) {
    out.push("tutela de urgência art. 300 CPC", "probabilidade do direito perigo de dano art. 300 CPC", "tutela urgência 300 CPC");
  }
  return [...new Set(out.filter(Boolean))].slice(0, 5);
}

function cql(query) {
  const q = quote(String(query).trim());
  return `(description any "${q}" or title any "${q}" or subject any "${q}")`;
}

function challengeSignal(body = "", contentType = "") {
  const raw = String(body);
  const content = raw.slice(0, 5000);
  const type = String(contentType || "").toLowerCase();
  const htmlLike = /text\/html/.test(type) || /^\s*<!doctype\s+html/i.test(content) || /<html[\s>]/i.test(content);
  const securityText = /verificando sua conex[aã]o|conex[aã]o verificada|n[aã]o foi poss[ií]vel verificar|nao foi possivel verificar|javascript is required|checking your connection|security check/i.test(content);
  return {
    detected: Boolean(securityText || (htmlLike && /senado federal|lexml/i.test(content) && /verific/i.test(content))),
    html_like: htmlLike,
    content_type: contentType || null
  };
}

function safeExcerpt(body = "") {
  return stripXml(String(body).slice(0, 1200)).slice(0, 240);
}

function parseSru(xml = "", limit = 10, meta = {}) {
  const body = String(xml);
  const contentType = String(meta.contentType || meta.content_type || "");
  const challenge = challengeSignal(body, contentType);
  if (challenge.detected) {
    return {
      ok: false,
      error: "lexml_sru_security_challenge",
      status: "security_challenge",
      provider_availability: "blocked_by_security_challenge",
      retryable: false,
      total: 0,
      results: [],
      challenge: {
        kind: "security_challenge",
        content_type: challenge.content_type,
        html_like: challenge.html_like,
        excerpt: safeExcerpt(body),
        external_action_required: "official_provider_access_review"
      }
    };
  }
  if (!body.trim().startsWith("<")) {
    return {
      ok: false,
      error: "lexml_sru_non_xml",
      status: "invalid_response",
      provider_availability: "invalid_response",
      retryable: true,
      total: 0,
      results: []
    };
  }
  if (/<(?:\w+:)?diagnostics\b/i.test(body) && !/<(?:\w+:)?searchRetrieveResponse\b/i.test(body)) {
    return {
      ok: false,
      error: "lexml_sru_diagnostic",
      status: "sru_diagnostic",
      provider_availability: "diagnostic_response",
      retryable: false,
      total: 0,
      results: []
    };
  }
  const total = Number(first(body, "numberOfRecords") || 0);
  const blocks = body.match(/<(?:[A-Za-z0-9_-]+:)?record\b[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?record>/gi) || [];
  const results = blocks.slice(0, limit).map(block => {
    const urn = first(block, "urn") || first(block, "identifier");
    return {
      title: first(block, "title"),
      court_source: first(block, "autoridade") || first(block, "creator"),
      url: urnUrl(urn),
      summary: first(block, "description"),
      published_at: first(block, "date"),
      identifier: urn,
      subject: first(block, "subject"),
      document_type: first(block, "tipoDocumento") || first(block, "type"),
      locality: first(block, "localidade")
    };
  }).filter(r => r.title || r.identifier || r.url);
  return { ok: true, status: "ok", total, results };
}

async function fetchSru(query, limit, fetchImpl) {
  const url = new URL(SRU);
  url.searchParams.set("operation", "searchRetrieve");
  url.searchParams.set("version", "1.1");
  url.searchParams.set("query", cql(query));
  url.searchParams.set("startRecord", "1");
  url.searchParams.set("maximumRecords", String(limit));
  url.searchParams.set("recordSchema", "dc");
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/xml,text/xml;q=0.9,*/*;q=0.1",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.3",
        "cache-control": "no-cache",
        pragma: "no-cache",
        referer: `${BASE}/busca/search`,
        "user-agent": UA
      }
    });
  } catch {
    return {
      ok: false,
      error: "lexml_sru_unreachable",
      status: "unreachable",
      provider_availability: "network_unreachable",
      retryable: true,
      url,
      results: []
    };
  }
  const contentType = typeof response.headers?.get === "function" ? response.headers.get("content-type") : "";
  const xml = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      error: "lexml_sru_http_error",
      status: "http_error",
      http_status: response.status,
      provider_availability: "http_error",
      retryable: response.status >= 500,
      content_type: contentType || null,
      url,
      results: []
    };
  }
  const parsed = parseSru(xml, limit, { contentType });
  return {
    ...parsed,
    http_status: response.status,
    content_type: contentType || null,
    url
  };
}

export async function searchLexml({ query, limit = 5, fetchImpl = globalThis.fetch } = {}) {
  const q = String(query || "").trim();
  const bounded = Math.min(Math.max(Number(limit) || 5, 1), 10);
  if (!q) return { ok: false, provider: "lexml", error: "query_required", results: [] };
  const attempted = [];
  let selected = null;
  let last = null;
  for (const candidate of plan(q)) {
    attempted.push(candidate);
    const page = await fetchSru(candidate, bounded, fetchImpl);
    if (!page.ok) { last = page; continue; }
    selected = { ...page, candidate };
    if (page.results.length || page.total > 0) break;
  }
  if (!selected && last) {
    return {
      ok: false,
      provider: "lexml",
      source: "LexML Brasil",
      official: true,
      read_only: true,
      error: last.error,
      status: last.status || "provider_unavailable",
      provider_availability: last.provider_availability || "provider_unavailable",
      retryable: Boolean(last.retryable),
      http_status: last.http_status ?? null,
      content_type: last.content_type ?? null,
      challenge: last.challenge || null,
      query: q,
      attempted_queries: attempted,
      search_url: last.url?.toString?.() || null,
      results: []
    };
  }
  return {
    ok: true,
    provider: "lexml",
    source: "LexML Brasil",
    official: true,
    read_only: true,
    backend: "sru-1.1",
    query: q,
    effective_query: selected?.candidate || null,
    attempted_queries: attempted,
    search_url: selected?.url?.toString() || null,
    total_count: Number(selected?.total || 0),
    count: selected?.results?.length || 0,
    results: selected?.results || []
  };
}

export const __test = { compact, plan, cql, parseSru, challengeSignal };
