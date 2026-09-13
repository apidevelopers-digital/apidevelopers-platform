
const UA = "lex-legal-api/1.2.0";

function stripHtml(s = "") {
  return String(s)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function officialText(url, accept = "text/html", fetchImpl = globalThis.fetch) {
  if (
    !/^https:\/\/(?:www\.)?planalto\.gov\.br\//i.test(url) &&
    !/^https:\/\/legis\.senado\.leg\.br\//i.test(url)
  ) throw new Error("non_official_legislation_url");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetchImpl(url, {
      headers: { "user-agent": UA, accept },
      signal: controller.signal,
      redirect: "follow"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return {
      text: (await response.text()).slice(0, 2_000_000),
      url: response.url || url,
      status: response.status
    };
  } finally {
    clearTimeout(timer);
  }
}

function reference(query = "") {
  const raw = String(query).trim();
  const normalized = raw.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  let number = null, year = null, alias = null, url = "";

  if (/\b(cpc|codigo de processo civil)\b/.test(normalized)) {
    number = "13105";
    year = "2015";
    alias = "Código de Processo Civil";
    url = "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm";
  } else if (/\b(cf|constituicao federal)\b/.test(normalized)) {
    year = "1988";
    alias = "Constituição Federal";
    url = "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm";
  } else {
    const m = normalized.match(/\blei(?:\s+complementar)?\s*(?:n[.ºo°]*\s*)?([0-9][0-9.\s]*)(?:\s*\/\s*((?:18|19|20|21)\d{2}))?/i);
    if (m) {
      number = m[1].replace(/\D/g, "");
      year = m[2] || null;
    }
  }

  const a = normalized.match(/\bart(?:igo)?\.?\s*(\d+[a-z]?)\b/i);
  return { raw, number, year, alias, article: a ? a[1] : null, url };
}

function article(text, number) {
  if (!number) return text.slice(0, 7000);
  const escaped = String(number).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\bArt\\.?\\s*${escaped}\\b(?:\\s*|[ºo°.,-])`, "i");
  const m = re.exec(text);
  if (!m) return "";
  const rest = text.slice(m.index);
  const next = /\bArt\.?\s*\d+[A-Za-z]?\b/i.exec(rest.slice(Math.max(6, m[0].length)));
  return rest.slice(0, next ? Math.max(900, next.index + Math.max(6, m[0].length)) : 6000).trim();
}

async function searchLegislation({ query, fetchImpl = globalThis.fetch } = {}) {
  const ref = reference(query);
  const evidence = [];
  const results = [];

  if (!ref.url && !ref.number) {
    return {
      ok: true,
      status: "source_insufficient",
      service: "lex-legislation",
      query: ref.raw,
      reference: ref,
      result_count: 0,
      results: [],
      evidence: [],
      sources_used: [],
      read_only: true,
      human_review_required: true,
      no_invention_policy: true
    };
  }

  if (ref.url) {
    try {
      const f = await officialText(ref.url, "text/html", fetchImpl);
      const content = article(stripHtml(f.text), ref.article);
      evidence.push({ source: "planalto", url: f.url, status: "ok", http_status: f.status });
      if (content || f.url) results.push({
        provider: "planalto",
        source: "Planalto — Legislação Federal",
        source_url: f.url,
        official: true,
        title: ref.alias || `Lei ${ref.number || ""}`,
        content,
        article: ref.article,
        number: ref.number,
        year: ref.year,
        read_only: true
      });
    } catch (error) {
      evidence.push({ source: "planalto", url: ref.url, status: "error", error: String(error?.message || error).slice(0, 200) });
    }
  }

  if (!results.length && ref.number) {
    const qs = new URLSearchParams({ tipo: "LEI", numero: String(ref.number) });
    if (ref.year) qs.set("ano", String(ref.year));
    const url = `https://legis.senado.leg.br/dadosabertos/legislacao/lista?${qs.toString()}`;

    try {
      const f = await officialText(url, "application/json", fetchImpl);
      let parsed = null;
      try { parsed = JSON.parse(f.text); } catch {}
      const content = parsed ? JSON.stringify(parsed) : f.text;
      evidence.push({ source: "senado", url: f.url, status: "ok", http_status: f.status });
      results.push({
        provider: "senado",
        source: "Senado Federal — Dados Abertos",
        source_url: f.url,
        official: true,
        title: ref.alias || `Lei ${ref.number}${ref.year ? `/${ref.year}` : ""}`,
        content: content.slice(0, 16000),
        article: ref.article,
        number: ref.number,
        year: ref.year,
        read_only: true
      });
    } catch (error) {
      evidence.push({ source: "senado", url, status: "error", error: String(error?.message || error).slice(0, 200) });
    }
  }

  return {
    ok: true,
    status: results.length ? "ok" : "source_unavailable",
    service: "lex-legislation",
    query: ref.raw,
    reference: ref,
    result_count: results.length,
    results,
    evidence,
    sources_used: [...new Set(results.map(r => r.provider))],
    read_only: true,
    human_review_required: true,
    no_invention_policy: true
  };
}

export { searchLegislation };
export const __test = { reference, stripHtml, article };
