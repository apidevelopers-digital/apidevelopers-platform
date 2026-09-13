import { globalSearch } from "./global-search.js";
import { searchLegislation } from "./legislation.js";
import { getProcesso } from "./datajud.js";
import { consolidatedSearch } from "./consolidated-search.js";
import { analyzeStrategyWithOpenAI } from "../lex_strategy.js";
import { assessClaimAgainstEvidence } from "./claim-evidence-validator.js";
import { assessSemanticClaim } from "./semantic-claim-validator.js";
import { assessNormativeValidity } from "./normative-validity-validator.js";
import { searchJurimetrics } from "./jurimetrics.js";

const PATHS = new Set(["/v1/analyze", "/v1/jurimetrics/search", "/v1/veritas"]);
const VERITAS_MODES = new Set(["claim_precheck", "claim_semantic", "normative_validity"]);

function clean(value, limit = 4000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function safeLimit(value, fallback = 8, max = 20) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), 1), max);
}

function publicPolicy(payload = {}) {
  return {
    ...payload,
    read_only: true,
    persistence: false,
    office_database_access: false,
    database_write_allowed: false,
    write_executed: false,
    human_review_required: true,
    final_legal_conclusion_allowed: false,
    probability_of_success_allowed: false,
    no_invention_policy: true
  };
}

function invalid(status, message, http = 400) {
  return {
    http,
    payload: publicPolicy({
      ok: false,
      status,
      service: "lex-mitra-professional-orchestrator",
      message
    })
  };
}

function normalizeDispatch(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: invalid("invalid_dispatch", "Dispatch body must be an object") };
  }
  const path = clean(input.path, 120);
  if (!PATHS.has(path)) {
    return { error: invalid("unsupported_path", "Professional capability path is not supported", 404) };
  }
  const payload = input.payload ?? {};
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: invalid("invalid_payload", "Capability payload must be an object") };
  }
  return { path, payload };
}

async function analyze(payload, deps) {
  const question = clean(payload.question, 5000);
  if (!question) return invalid("question_required", "question is required");

  const facts = Array.isArray(payload.facts)
    ? payload.facts.slice(0, 60).map((item) => clean(
        typeof item === "string" ? item : item?.statement ?? item?.fact ?? item?.text,
        1600
      )).filter(Boolean)
    : [];
  const tribunal = clean(payload.tribunal, 50);
  const limit = safeLimit(payload.limit, 8, 20);

  let searchResult;
  try {
    searchResult = await deps.consolidatedSearchImpl({
      query: question,
      tribunal,
      limit,
      globalSearch: deps.globalSearchImpl,
      searchLegislation: deps.searchLegislationImpl,
      getProcesso: deps.getProcessoImpl
    });
  } catch {
    return invalid("retrieval_failed", "Official-source retrieval failed", 502);
  }

  const evidence = Array.isArray(searchResult?.evidence ?? searchResult?.results)
    ? (searchResult.evidence ?? searchResult.results)
    : [];
  if (!evidence.length) {
    return {
      http: 422,
      payload: publicPolicy({
        ok: false,
        status: "evidence_required",
        service: "lex-mitra-professional-orchestrator",
        capability: "assistant",
        sources_checked: searchResult?.sources_checked ?? []
      })
    };
  }

  let analysis;
  try {
    analysis = await deps.analyzeStrategyImpl({
      question,
      facts,
      tribunal,
      searchResult
    });
  } catch {
    return invalid("analysis_failed", "Governed legal analysis failed", 502);
  }

  const http = Number(analysis?.http) || 502;
  const result = analysis?.payload && typeof analysis.payload === "object"
    ? analysis.payload
    : { status: "analysis_invalid_output" };

  return {
    http,
    payload: publicPolicy({
      ok: http >= 200 && http < 300,
      capability: "assistant",
      retrieval: {
        source_count: evidence.length,
        sources_checked: searchResult?.sources_checked ?? []
      },
      result
    })
  };
}

async function veritas(payload, deps) {
  const mode = clean(payload.mode, 80).toLowerCase();
  if (!VERITAS_MODES.has(mode)) return invalid("veritas_mode_invalid", "Unsupported Veritas mode");

  const evidence = payload.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return invalid("evidence_required", "Structured evidence is required");
  }

  if (mode === "normative_validity") {
    const asOfDate = clean(payload.as_of_date ?? payload.asOfDate, 80);
    if (!asOfDate) return invalid("as_of_date_required", "as_of_date is required");
    const assessment = deps.assessNormativeValidityImpl({
      evidence,
      as_of_date: asOfDate
    });
    const http = assessment?.ok === false && assessment?.status === "as_of_date_invalid" ? 400 : 200;
    return {
      http,
      payload: publicPolicy({
        ok: http === 200,
        capability: "veritas",
        mode,
        assessment
      })
    };
  }

  const claim = clean(payload.claim, 12_000);
  if (!claim) return invalid("claim_required", "claim is required");

  const precheck = deps.assessClaimImpl({ claim, evidence });
  if (mode === "claim_precheck") {
    return {
      http: 200,
      payload: publicPolicy({
        ok: true,
        capability: "veritas",
        mode,
        assessment: precheck
      })
    };
  }

  const semantic = await deps.assessSemanticClaimImpl({
    claim,
    evidence: [evidence],
    precheck
  });
  return {
    http: 200,
    payload: publicPolicy({
      ok: true,
      capability: "veritas",
      mode,
      precheck,
      assessment: semantic
    })
  };
}

export function createMitraProfessionalOrchestrator({
  globalSearchImpl = globalSearch,
  searchLegislationImpl = searchLegislation,
  getProcessoImpl = getProcesso,
  consolidatedSearchImpl = consolidatedSearch,
  analyzeStrategyImpl = analyzeStrategyWithOpenAI,
  searchJurimetricsImpl = searchJurimetrics,
  assessClaimImpl = assessClaimAgainstEvidence,
  assessSemanticClaimImpl = assessSemanticClaim,
  assessNormativeValidityImpl = assessNormativeValidity
} = {}) {
  const deps = {
    globalSearchImpl,
    searchLegislationImpl,
    getProcessoImpl,
    consolidatedSearchImpl,
    analyzeStrategyImpl,
    searchJurimetricsImpl,
    assessClaimImpl,
    assessSemanticClaimImpl,
    assessNormativeValidityImpl
  };

  return Object.freeze({
    paths: Object.freeze([...PATHS]),
    async dispatch(input = {}) {
      const normalized = normalizeDispatch(input);
      if (normalized.error) return normalized.error;
      const { path, payload } = normalized;

      if (path === "/v1/analyze") return analyze(payload, deps);
      if (path === "/v1/jurimetrics/search") return deps.searchJurimetricsImpl(payload);
      if (path === "/v1/veritas") return veritas(payload, deps);

      return invalid("unsupported_path", "Professional capability path is not supported", 404);
    }
  });
}

export const mitraProfessionalOrchestrator = createMitraProfessionalOrchestrator();
export const __test = { normalizeDispatch, publicPolicy, safeLimit };
