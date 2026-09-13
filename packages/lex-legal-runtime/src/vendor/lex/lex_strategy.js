import {
  STRATEGY_OUTPUT_TEMPLATE,
  STRATEGY_SCHEMA_VERSION,
  parseStrategyText
} from "./lex_strategy_contract.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const EPISTEMIC_STATES = new Set([
  "COMPROVADO",
  "RELATADO",
  "INFERIDO",
  "CONTRADITORIO",
  "DESCONHECIDO"
]);

export function strategyAiReadiness(env = process.env) {
  const key = String(env.OPENAI_API_KEY || "").trim();
  const model = String(env.OPENAI_MODEL || "").trim();
  return {
    enabled: String(env.AI_ENABLED || "").toLowerCase() === "true",
    api_key_present: Boolean(key),
    model_present: Boolean(model),
    model: model || null
  };
}

function clean(value, limit = 3000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeState(value) {
  const raw = clean(value, 40)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return EPISTEMIC_STATES.has(raw) ? raw : "DESCONHECIDO";
}

function normalizeFact(fact, index) {
  if (typeof fact === "string") {
    return {
      id: `F-${String(index + 1).padStart(3, "0")}`,
      statement: clean(fact, 1600),
      epistemic_state: "RELATADO",
      source: null,
      location: null,
      verified_at: null
    };
  }

  const row = fact && typeof fact === "object" && !Array.isArray(fact) ? fact : {};
  return {
    id: clean(row.id || `F-${String(index + 1).padStart(3, "0")}`, 80),
    statement: clean(row.statement || row.fact || row.text || "", 1600),
    epistemic_state: normalizeState(row.epistemic_state || row.state || row.classification),
    source: clean(row.source || row.source_name || "", 300) || null,
    location: clean(row.location || row.page || row.frame || row.timestamp || "", 300) || null,
    verified_at: clean(row.verified_at || "", 80) || null
  };
}

function rankEvidence(row = {}) {
  let score = 0;
  if (row.official ?? row.is_official) score += 100;
  if (row.source_url) score += 25;
  if (row.tribunal) score += 15;
  if (row.processo) score += 10;
  if (row.article) score += 8;
  if (row.content || row.ementa || row.excerpt) score += 5;
  return score;
}

function compactEvidence(rows = [], maxRows = 30) {
  const all = Array.isArray(rows) ? rows : [];
  const official = all.filter(
    (row) =>
      Boolean(row?.official ?? row?.is_official) &&
      !Boolean(row?.synthetic ?? row?.is_synthetic)
  );

  const selected = official
    .map((row, index) => ({ row, index, score: rankEvidence(row) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxRows)
    .sort((a, b) => a.index - b.index)
    .map(({ row }, index) => ({
      id: index + 1,
      type: row.result_type || null,
      title: clean(row.title || row.processo || "", 300),
      source: row.source_name || row.source || null,
      source_url: row.source_url || null,
      official: Boolean(row.official ?? row.is_official),
      synthetic: Boolean(row.synthetic ?? row.is_synthetic),
      tribunal: row.tribunal || null,
      processo: row.processo || null,
      article: row.article || null,
      excerpt: clean(row.content || row.ementa || row.excerpt || "", 3600)
    }));

  return {
    rows: selected,
    coverage: {
      input_count: all.length,
      official_count: official.length,
      selected_count: selected.length,
      truncated: official.length > selected.length,
      max_rows: maxRows
    }
  };
}

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const parts = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function hasUnknownFacts(facts = []) {
  return facts.some(
    (fact) => fact.epistemic_state === "DESCONHECIDO" && Boolean(fact.statement)
  );
}

function strategyInstructions() {
  return [
    "Você é o motor de estratégia jurídica verificável da Lex/Mitra.",
    "Use EXCLUSIVAMENTE os fatos e as evidências oficiais fornecidos no input.",
    "Retorne SOMENTE JSON válido, sem markdown, comentários ou texto fora do JSON.",
    `Use exatamente o schema ${STRATEGY_SCHEMA_VERSION}.`,
    `Modelo estrutural: ${JSON.stringify(STRATEGY_OUTPUT_TEMPLATE)}.`,
    "Toda issue, regra, hipótese, risco, contradição e contrachecagem deve citar fact_ids e/ou evidence_ids existentes.",
    "Não invente jurisprudência, número de processo, fato, prazo, citação ou fonte.",
    "Não forneça percentual ou probabilidade de êxito.",
    "Hipóteses só podem usar PLAUSIBLE, CONTESTED ou INSUFFICIENT_EVIDENCE.",
    "Riscos só podem usar LOW, MEDIUM, HIGH ou UNKNOWN.",
    "Próximas ações são propostas para decisão humana; nunca são executadas automaticamente.",
    "Se faltar prova, registre em unknowns e reduza a assertividade.",
    "Inclua countercheck tentando refutar as hipóteses principais.",
    "A saída é minuta para revisão por advogado, nunca conclusão jurídica final."
  ].join(" ");
}

export async function analyzeStrategyWithOpenAI({
  question,
  facts = [],
  tribunal = "stj",
  searchResult,
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const readiness = strategyAiReadiness(env);

  if (!readiness.enabled || !readiness.api_key_present || !readiness.model_present) {
    return {
      http: 503,
      payload: {
        status: "ai_not_configured",
        service: "lex-strategy-core",
        readiness,
        schema_version: STRATEGY_SCHEMA_VERSION,
        human_review_required: true,
        final_legal_conclusion_allowed: false,
        probability_of_success_allowed: false,
        execute_actions: false
      }
    };
  }

  const normalizedFacts = (Array.isArray(facts) ? facts : []).slice(0, 60).map(normalizeFact);
  const bundle = compactEvidence(searchResult?.results || [], 30);
  const evidence = bundle.rows;

  if (!evidence.length) {
    return {
      http: 422,
      payload: {
        status: "evidence_required",
        service: "lex-strategy-core",
        schema_version: STRATEGY_SCHEMA_VERSION,
        evidence_coverage: bundle.coverage,
        human_review_required: true,
        final_legal_conclusion_allowed: false,
        probability_of_success_allowed: false,
        execute_actions: false
      }
    };
  }

  if (typeof fetchImpl !== "function") {
    return {
      http: 502,
      payload: {
        status: "ai_fetch_unavailable",
        service: "lex-strategy-core",
        schema_version: STRATEGY_SCHEMA_VERSION,
        human_review_required: true,
        final_legal_conclusion_allowed: false,
        probability_of_success_allowed: false,
        execute_actions: false
      }
    };
  }

  const input = {
    question: clean(question, 5000),
    tribunal: clean(tribunal, 50),
    facts: normalizedFacts,
    evidence,
    evidence_coverage: bundle.coverage,
    epistemic_policy: {
      allowed_states: [...EPISTEMIC_STATES],
      no_promotion_without_new_evidence: true,
      missing_source_is_not_nonexistence: true,
      no_deadline_without_starting_event: true
    }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetchImpl(OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: readiness.model,
        instructions: strategyInstructions(),
        input: JSON.stringify(input),
        store: false
      }),
      signal: controller.signal
    });

    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {}

    if (!response.ok) {
      return {
        http: 502,
        payload: {
          status: "ai_upstream_error",
          service: "lex-strategy-core",
          upstream_http_status: response.status,
          detail: data?.error?.message || "OpenAI Responses API indisponível.",
          evidence_coverage: bundle.coverage,
          schema_version: STRATEGY_SCHEMA_VERSION,
          human_review_required: true,
          final_legal_conclusion_allowed: false,
          probability_of_success_allowed: false,
          execute_actions: false
        }
      };
    }

    const text = extractText(data);
    if (!text) {
      return {
        http: 502,
        payload: {
          status: "ai_empty_output",
          service: "lex-strategy-core",
          evidence_coverage: bundle.coverage,
          schema_version: STRATEGY_SCHEMA_VERSION,
          human_review_required: true,
          final_legal_conclusion_allowed: false,
          probability_of_success_allowed: false,
          execute_actions: false
        }
      };
    }

    let strategy;
    try {
      strategy = parseStrategyText(text, { facts: normalizedFacts, evidence });
    } catch (error) {
      return {
        http: 502,
        payload: {
          status: "ai_invalid_strategy_output",
          service: "lex-strategy-core",
          detail: String(error?.message || "strategy_output_invalid"),
          evidence_coverage: bundle.coverage,
          schema_version: STRATEGY_SCHEMA_VERSION,
          human_review_required: true,
          final_legal_conclusion_allowed: false,
          probability_of_success_allowed: false,
          execute_actions: false
        }
      };
    }

    const hardGateTriggered = bundle.coverage.truncated || hasUnknownFacts(normalizedFacts);

    return {
      http: 200,
      payload: {
        status: "ok",
        service: "lex-strategy-core",
        provider: "openai",
        model: readiness.model,
        schema_version: STRATEGY_SCHEMA_VERSION,
        strategy,
        analysis: strategy.summary,
        facts: normalizedFacts,
        evidence,
        evidence_coverage: bundle.coverage,
        integrity: {
          official: evidence.length,
          synthetic: 0,
          source_urls_present: evidence.filter((item) => item.source_url).length,
          epistemic_states_present: [...new Set(normalizedFacts.map((fact) => fact.epistemic_state))],
          hard_gate_triggered: hardGateTriggered
        },
        human_review_required: true,
        final_legal_conclusion_allowed: false,
        probability_of_success_allowed: false,
        execute_actions: false,
        no_invention_policy: true,
        persistence: false
      }
    };
  } catch (error) {
    return {
      http: 502,
      payload: {
        status: "ai_fetch_failed",
        service: "lex-strategy-core",
        error: error?.name === "AbortError" ? "openai_timeout" : "openai_fetch_failed",
        evidence_coverage: bundle.coverage,
        schema_version: STRATEGY_SCHEMA_VERSION,
        human_review_required: true,
        final_legal_conclusion_allowed: false,
        probability_of_success_allowed: false,
        execute_actions: false
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

export const __test = {
  normalizeState,
  normalizeFact,
  compactEvidence,
  extractText,
  strategyInstructions
};
