
const DATAJUD_TRIBUNAIS = new Set(`
tjsc tjpr tjrs tjmg tjrj tjsp tjba tjce tjpe tjgo tjma tjms tjmt tjpa tjpb tjpi tjrn tjro tjrr tjse tjto tjdft
trf1 trf2 trf3 trf4 trf5 trf6
stj stf tst
trt1 trt2 trt3 trt4 trt5 trt6 trt7 rtt8 trt9 trt10 trt11 trt12 trt13 trt14 trt15 trt16 trt17 trt18 trt19 trt20 trt21 trt22 trt23 trt24
tjac tjal tjam tjap tjes
treac treal tream treap treba trece tredf trees trego trema tremg trems tremt trepa trepb trepe trepi trepr trerj trern trero trerr trers tresc trese tresp treto
tjmmg tjmrs tjmsp
`.trim().split(/\s+/));

function normalizeCnj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 20 ? digits : "";
}

function normalizeTribunal(value) {
  const alias = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return DATAJUD_TRIBUNAIS.has(alias) ? alias : "";
}

function compactMovimentos(items) {
  return Array.isArray(items) ? items.slice(0, 200).map(m => ({
    codigo: m?.codigo ?? null,
    nome: m?.nome ?? m?.movimentoNacional?.nome ?? null,
    dataHora: m?.dataHora ?? null,
    complementos: Array.isArray(m?.complementosTabelados) ? m.complementosTabelados.slice(0, 20) : []
  })) : [];
}

function readiness() {
  const keyPresent = Boolean(String(process.env.DATAJUD_API_KEY || "").trim());
  const enabled = process.env.DATAJUD_ENABLED === undefined
    ? keyPresent
    : String(process.env.DATAJUD_ENABLED).toLowerCase() === "true";
  return { enabled, key_present: keyPresent, read_only: true };
}

async function getProcesso({ numeroCnj, tribunal = "tjsc", size = 1, fetchImpl = globalThis.fetch } = {}) {
  const numero = normalizeCnj(numeroCnj);
  const trib = normalizeTribunal(tribunal);

  if (!numero) return { http: 400, payload: { ok: false, status: "error", error: "numero_cnj/invalid" } };
  if (!trib) return { http: 400, payload: { ok: false, status: "error", error: "tribunal_invalid" } };

  const ready = readiness();
  if (!ready.enabled || !ready.key_present) {
    return {
      http: 503,
      payload: {
        ok: false,
        status: "guarded",
        error: "datajud_not_configured",
        readiness: ready,
        human_review_required: true,
        no_invention_policy: true
      }
    };
  }

  const endpoint = `https://api-publica.datajud.cnj.jus.br/api_publica_${trib}/_search`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const limit = Math.min(Math.max(Number(size) || 1, 1), 25);
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `APIKey ${process.env.DATAJUD_API_KEY}`
      },
      body: JSON.stringify({ query: { match: { numeroProcesso: numero } }, size: limit }),
      signal: controller.signal
    });

    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}

    if (!response.ok) {
      return {
        http: 502,
        payload: {
          ok: false,
          status: "source_unavailable",
          source: "cnj_datajud_api_publica",
          upstream_http_status: response.status,
          human_review_required: true,
          no_invention_policy: true
        }
      };
    }

    const hits = Array.isArray(data?.hits?.hits) ? data.hits.hits : [];
    const results = hits.map(h => {
      const x = h?._source || {};
      return {
        numeroProcesso: x.numeroProcesso || numero,
        tribunal: x.tribunal || trib.toUpperCase(),
        classe: x.classe || null,
        sistema: x.sistema || null,
        formato: x.formato || null,
        grau: x.grau || null,
        nivelSigilo: x.nivelSigilo ?? null,
        dataAjuizamento: x.dataAjuizamento || null,
        dataHoraUltimaAtualizacao: x.dataHoraUltimaAtualizacao || null,
        orgaoJulgador: x.orgaoJulgador || null,
        assuntos: Array.isArray(x.assuntos) ? x.assuntos.slice(0, 100) : [],
        movimentos: compactMovimentos(x.movimentos)
      };
    });

    return {
      http: 200,
      payload: {
        ok: true,
        status: results.length ? "ok" : "not_found",
        service: "lex-datajud",
        source: "cnj_datajud_api_publica",
        source_url: endpoint,
        tribunal: trib,
        numero_cnj: numero,
        result_count: results.length,
        results,
        read_only: true,
        human_review_required: true,
        no_invention_policy: true
      }
    };
  } catch (error) {
    return {
      http: 502,
      payload: {
        ok: false,
        status: "source_unavailable",
        source: "cnj_datajud_api_publica",
        error: error?.name === "AbortError" ? "datajud_timeout" : "datajud_fetch_failed",
        human_review_required: true,
        no_invention_policy: true
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

export { getProcesso, readiness };
export const __test = { normalizeCnj, normalizeTribunal };
