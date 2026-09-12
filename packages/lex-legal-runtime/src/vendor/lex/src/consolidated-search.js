import { validateEvidenceBatch } from "./evidence-validator.js";

function extractCnj(value = "") {
  const raw = String(value);
  const m = raw.match(/\b(?:[0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4}|[0-9]{20})\b/);
  return m ? m[0].replace(/\D/g, "") : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function consolidatedSearch({
  query,
  tribunal = "",
  limit = 8,
  globalSearch,
  searchLegislation,
  getProcesso
} = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, status: "query_required", results: [], evidence: [] };

  const cnj = extractCnj(q);
  const tasks = [
    Promise.resolve().then(() => globalSearch(q, { tribunal, limit })),
    Promise.resolve().then(() => searchLegislation({ query: q }))
  ];
  if (cnj) {
    tasks.push(Promise.resolve().then(() => getProcesso({
      numeroCnj: cnj,
      tribunal: tribunal || "tjsc",
      size: 3
    })));
  }

  const settled = await Promise.allSettled(tasks);

  const core = settled[0].status === "fulfilled"
    ? settled[0].value
    : { ok: false, status: "upstream_failure", evidence: [], results: [] };

  const legislation = settled[1].status === "fulfilled"
    ? settled[1].value
    : { ok: false, status: "upstream_failure", results: [], evidence: [] };

  const processo = cnj
    ? (settled[2]?.status === "fulfilled"
      ? settled[2].value
      : { http: 502, payload: { ok: false, status: "upstream_failure", results: [] } })
    : null;

  const processPayload = processo?.payload || null;
  const providers = {
    lexml: core?.providers?.lexml || null,
    stj: core?.providers?.stj || null,
    legislation: {
      ok: Boolean(legislation?.ok),
      status: legislation?.status || "unknown",
      sources_used: asArray(legislation?.sources_used)
    },
    datajud: cnj ? {
      ok: Boolean(processPayload?.ok),
      status: processPayload?.status || "unknown",
      http: processo?.http || null
    } : null
  };

  const jurisprudence = asArray(core?.evidence || core?.results);
  const legislationResults = asArray(legislation?.results);
  const processResults = asArray(processPayload?.results).map(r => ({
    provider: "datajud",
    source: "CNJ DataJud",
    official: true,
    read_only: true,
    ...r
  }));

  const rawEvidence = [...jurisprudence, ...legislationResults, ...processResults];
  const validatedEvidence = validateEvidenceBatch(rawEvidence);
  const evidence = validatedEvidence.evidence;
  const sourcesChecked = [...new Set([
    ...asArray(core?.sources_checked),
    ...asArray(legislation?.sources_used),
    ...(cnj ? ["datajud"] : [])
  ])];

  return {
    ok: true,
    status: evidence.length ? "ok" : "source_insufficient",
    service: "lex-legal-api",
    mode: "consolidated",
    query: q,
    cnj_detected: cnj,
    result_count: evidence.length,
    evidence,
    results: evidence,
    sources_checked: sourcesChecked,
    providers,
    evidence_validation: validatedEvidence.summary,
    human_review_required: true,
    final_legal_conclusion_allowed: false,
    no_invention_policy: true,
    read_only: true
  };
}

export { consolidatedSearch };
export const __test = { extractCnj };
