import { searchStjJurisprudence } from "../stj_jurisprudencia.js";
import { searchLexml } from "./lexml.js";

function boundedLimit(value, fallback = 8, max = 20) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), max);
}

function normalizeLexml(result) {
  if (!result?.ok) return [];
  return (result.results || []).map((row) => ({
    provider: "lexml",
    source: result.source || "LexML Brasil",
    official: true,
    read_only: true,
    title: row.title || null,
    court_source: row.court_source || null,
    url: row.url || null,
    summary: row.summary || null,
    published_at: row.published_at || null,
    identifier: row.identifier || null,
    document_type: row.document_type || null,
    locality: row.locality || null,
  }));
}

function normalizeStj(result) {
  return (result?.results || []).map((row) => ({
    provider: "stj",
    source: row.source || "STJ",
    official: Boolean(row.is_official ?? true),
    read_only: true,
    title: row.title || row.processo || null,
    court_source: "STJ",
    url: row.source_url || null,
    summary: row.content || null,
    published_at: row.data_publicacao || row.data_decisao || null,
    identifier: row.numero_registro || row.processo || row.id || null,
    document_type: row.tipo || "jurisprudencia",
  }));
}

async function globalSearch(query, { limit = 8, tribunal = "" } = {}) {
  const max = boundedLimit(limit);
  const court = String(tribunal || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const tasks = [searchLexml({ query, limit: Math.min(max, 10) })];
  if (!court || court === "stj" || court === "superiortribunaldejustica") {
    tasks.push(searchStjJurisprudence(query, Math.min(max, 10)));
  }

  const settled = await Promise.allSettled(tasks);
  const lexml =
    settled[0]?.status === "fulfilled"
      ? settled[0].value
      : { ok: false, error: "lexml_unreachable", results: [] };
  const stj = settled[1]?.status === "fulfilled" ? settled[1].value : null;

  const evidence = [...normalizeLexml(lexml), ...normalizeStj(stj)].slice(0, max);

  return {
    ok: true,
    status: evidence.length ? "ok" : "source_insufficient",
    service: "lex-legal-api",
    version: "1.2.0-mitra-backend",
    query,
    tribunal: tribunal || null,
    result_count: evidence.length,
    evidence,
    results: evidence,
    sources_checked: ["lexml", ...(stj ? ["stj"] : [])],
    providers: {
      lexml: {
        ok: Boolean(lexml?.ok),
        count: Number(lexml?.count || 0),
        error: lexml?.ok ? null : lexml?.error || "unavailable",
      },
      ...(stj
        ? {
            stj: {
              ok: stj?.status === "ok",
              count: Number(stj?.result_count || 0),
              coverage: stj?.coverage || null,
            },
          }
        : {}),
    },
    human_review_required: true,
    final_legal_conclusion_allowed: false,
    no_invention_policy: true,
    read_only: true,
  };
}

export { boundedLimit, globalSearch, normalizeLexml, normalizeStj };
