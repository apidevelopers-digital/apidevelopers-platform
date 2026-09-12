const DATAJUD_HOST = "https://api-publica.datajud.cnj.jus.br";

const TRIBUNAL_RE = /^(?:tj[a-z0-9]{2,8}|trf[1-6]|trt(?:[1-9]|1\d|2[0-4])|tre[a-z]{2}|tjm[a-z]{2}|stf|stj|tst|stm)$/i;

function clean(value, limit = 400) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function intCode(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const raw = clean(value, 30);
  if (!/^\d+$/.test(raw)) {
    const error = new Error(`${field} must be a positive integer code`);
    error.code = "jurimetrics_invalid_code";
    error.status = 400;
    throw error;
  }
  return Number(raw);
}

function normalizeTribunal(value) {
  const tribunal = clean(value, 20).toLowerCase();
  if (!tribunal || !TRIBUNAL_RE.test(tribunal)) {
    const error = new Error("tribunal must be a supported DataJud alias");
    error.code = "jurimetrics_invalid_tribunal";
    error.status = 400;
    throw error;
  }
  return tribunal;
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function readiness(env = process.env) {
  const keyPresent = Boolean(String(env.DATAJUD_API_KEY || "").trim());
  const enabled = env.DATAJUD_ENABLED === undefined
    ? keyPresent
    : boolEnv(env.DATAJUD_ENABLED, false);
  return { enabled, key_present: keyPresent, read_only: true };
}

function safeDate(value, field) {
  const raw = clean(value, 40);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw) || Number.isNaN(Date.parse(raw))) {
    const error = new Error(`${field} must be an ISO date`);
    error.code = "jurimetrics_invalid_period";
    error.status = 400;
    throw error;
  }
  return raw;
}

function normalizePeriod(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    const error = new Error("periodo must be an object");
    error.code = "jurimetrics_invalid_period";
    error.status = 400;
    throw error;
  }
  const from = safeDate(value.gte ?? value.from ?? value.start ?? value.inicio, "periodo.gte");
  const to = safeDate(value.lte ?? value.to ?? value.end ?? value.fim, "periodo.lte");
  if (!from && !to) {
    const error = new Error("periodo must define a start or end date");
    error.code = "jurimetrics_invalid_period";
    error.status = 400;
    throw error;
  }
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}

function unsupportedFilters(payload = {}) {
  return ["magistrado", "pedido", "tese", "comarca"].filter((key) => clean(payload[key], 200));
}

function exactProcessNumber(value) {
  const digits = clean(value, 40).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length !== 20) {
    const error = new Error("numeroProcesso must contain 20 digits");
    error.code = "jurimetrics_invalid_process_number";
    error.status = 400;
    throw error;
  }
  return digits;
}

function buildFilterQuery(payload = {}) {
  const filters = [];

  const classeCodigo = intCode(payload.classe_codigo ?? payload.classeCodigo, "classe_codigo");
  const assuntoCodigo = intCode(payload.assunto_codigo ?? payload.assuntoCodigo, "assunto_codigo");
  const movimentoCodigo = intCode(payload.movimento_codigo ?? payload.movimentoCodigo, "movimento_codigo");
  const orgaoCodigo = intCode(
    payload.orgao_julgador_codigo ?? payload.orgaoJulgadorCodigo,
    "orgao_julgador_codigo"
  );
  const numeroProcesso = exactProcessNumber(payload.numeroProcesso ?? payload.numero_processo);

  if (classeCodigo !== null) filters.push({ term: { "classe.codigo": classeCodigo } });
  if (assuntoCodigo !== null) filters.push({ term: { "assuntos.codigo": assuntoCodigo } });
  if (movimentoCodigo !== null) filters.push({ term: { "movimentos.codigo": movimentoCodigo } });
  if (orgaoCodigo !== null) filters.push({ term: { "orgaoJulgador.codigo": orgaoCodigo } });
  if (numeroProcesso) filters.push({ term: { numeroProcesso } });

  const classe = clean(payload.classe, 200);
  const assunto = clean(payload.assunto, 200);
  const movimento = clean(payload.movimento, 200);
  const orgao = clean(payload.orgao_julgador ?? payload.orgaoJulgador ?? payload.vara, 240);
  const query = clean(payload.query, 1200);
  const periodo = normalizePeriod(payload.periodo);

  if (classe) filters.push({ match: { "classe.nome": { query: classe, operator: "and" } } });
  if (assunto) filters.push({ match: { "assuntos.nome": { query: assunto, operator: "and" } } });
  if (movimento) filters.push({ match: { "movimentos.nome": { query: movimento, operator: "and" } } });
  if (orgao) filters.push({ match: { "orgaoJulgador.nome": { query: orgao, operator: "and" } } });
  if (query) {
    filters.push({
      multi_match: {
        query,
        fields: ["classe.nome^2", "assuntos.nome^2", "orgaoJulgador.nome^2", "movimentos.nome"],
        type: "best_fields",
        operator: "and"
      }
    });
  }
  if (periodo) filters.push({ range: { dataAjuizamento: periodo } });

  if (!filters.length) {
    const error = new Error("At least one jurimetrics filter besides tribunal is required");
    error.code = "jurimetrics_filter_required";
    error.status = 400;
    throw error;
  }
  return filters;
}

function totalHits(data) {
  const total = data?.hits?.total;
  if (typeof total === "number") return total;
  if (total && typeof total.value === "number") return total.value;
  return 0;
}

function buckets(data, key) {
  const rows = data?.aggregations?.[key]?.buckets;
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 50).map((row) => ({
    key: row?.key ?? null,
    count: Number(row?.doc_count || 0)
  }));
}

function policy(payload = {}) {
  return {
    ...payload,
    read_only: true,
    persistence: false,
    database_write_allowed: false,
    write_executed: false,
    human_review_required: true,
    final_legal_conclusion_allowed: false,
    probability_of_success_allowed: false,
    no_invention_policy: true
  };
}

export async function searchJurimetrics(payload = {}, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000
} = {}) {
  const unsupported = unsupportedFilters(payload);
  if (unsupported.length) {
    return {
      http: 400,
      payload: policy({
        ok: false,
        status: "unsupported_filter",
        unsupported_filters: unsupported,
        service: "lex-jurimetrics"
      })
    };
  }

  let tribunal;
  let filters;
  try {
    tribunal = normalizeTribunal(payload.tribunal);
    filters = buildFilterQuery(payload);
  } catch (error) {
    return {
      http: error?.status || 400,
      payload: policy({
        ok: false,
        status: error?.code || "jurimetrics_invalid_request",
        message: String(error?.message || "Invalid jurimetrics request"),
        service: "lex-jurimetrics"
      })
    };
  }

  const ready = readiness(env);
  if (!ready.enabled || !ready.key_present || typeof fetchImpl !== "function") {
    return {
      http: 503,
      payload: policy({
        ok: false,
        status: "datajud_not_configured",
        service: "lex-jurimetrics",
        readiness: ready
      })
    };
  }

  const bucketSize = Math.min(Math.max(Number(payload.limit) || 20, 1), 50);
  const body = {
    size: 0,
    track_total_hits: true,
    _source: false,
    query: { bool: { filter: filters } },
    aggs: {
      classes: { terms: { field: "classe.codigo", size: bucketSize } },
      subjects: { terms: { field: "assuntos.codigo", size: bucketSize } },
      judging_bodies: { terms: { field: "orgaoJulgador.codigo", size: bucketSize } },
      movements: { terms: { field: "movimentos.codigo", size: bucketSize } }
    }
  };

  const endpoint = `${DATAJUD_HOST}/api_publica_${tribunal}/_search`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(Number(timeoutMs) || 15_000, 1_000), 30_000));

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `APIKey ${String(env.DATAJUD_API_KEY || "").trim()}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}

    if (!response.ok) {
      return {
        http: 502,
        payload: policy({
          ok: false,
          status: "datajud_upstream_rejected",
          service: "lex-jurimetrics",
          upstream_http_status: response.status
        })
      };
    }

    return {
      http: 200,
      payload: policy({
        ok: true,
        status: "ok",
        service: "lex-jurimetrics",
        source: "CNJ DataJud API Pública",
        tribunal,
        total: totalHits(data),
        aggregations: {
          classes: buckets(data, "classes"),
          subjects: buckets(data, "subjects"),
          judging_bodies: buckets(data, "judging_bodies"),
          movements: buckets(data, "movements")
        }
      })
    };
  } catch (error) {
    return {
      http: 502,
      payload: policy({
        ok: false,
        status: error?.name === "AbortError" ? "datajud_timeout" : "datajud_fetch_failed",
        service: "lex-jurimetrics"
      })
    };
  } finally {
    clearTimeout(timer);
  }
}

export const __test = {
  normalizeTribunal,
  normalizePeriod,
  buildFilterQuery,
  readiness
};
