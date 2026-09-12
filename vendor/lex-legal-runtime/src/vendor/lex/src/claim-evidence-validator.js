import { validateEvidenceItem } from "./evidence-validator.js";

const STOPWORDS = new Set([
  "a","o","as","os","um","uma","uns","umas","de","da","do","das","dos","em","no","na","nos","nas",
  "por","para","com","sem","sob","sobre","entre","e","ou","que","se","ao","aos","à","às","como",
  "foi","foram","ser","são","esta","este","essa","esse","isso","isto","pela","pelo","pelas","pelos",
  "mais","menos","muito","muita","muitos","muitas","também","ainda","já","nao","sim","quando","onde",
  "qual","quais","cujo","cuja","cujos","cujas","ante","após","desde","até","durante","mediante",
  "jurídico","jurídica","direito","tribunal","decisão","julgado","processo","recurso"
]);

function cleanText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%$.,:/\-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value) {
  return [...new Set(
    cleanText(value)
      .split(/\s+/)
      .map(token => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
      .filter(token => token.length >= 4 && !STOPWORDS.has(token))
  )];
}

function evidenceText(item = {}) {
  return [
    item.title, item.titulo, item.content, item.conteudo, item.summary, item.resumo,
    item.ementa, item.tese_juridica, item.decisao, item.text, item.trecho, item.description
  ].filter(Boolean).join("\n");
}

function extractHardAnchors(value) {
  const raw = String(value ?? "");
  const normalized = cleanText(raw);
  const anchors = [];

  const cnj = raw.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g) || [];
  for (const match of cnj) anchors.push({ kind: "cnj", value: match.replace(/\D/g, "") });

  const money = raw.match(/R\$\s*\d[\d.\s]*(?:,\d{2})?/gi) || [];
  for (const match of money) {
    anchors.push({ kind: "money", value: match.replace(/\s+/g, "").toLowerCase() });
  }

  const dates = raw.match(/\b(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}\b/g) || [];
  for (const match of dates) anchors.push({ kind: "date", value: match.replace(/[.-]/g, "/") });

  const articles = raw.match(/\bart(?:igo)?\.?\s*(\d+[a-z]?)\b/gi) || [];
  for (const match of articles) {
    const m = match.match(/(\d+[a-z]?)\b/i);
    if (m) anchors.push({ kind: "article", value: m[1].toLowerCase() });
  }

  const sumulas = raw.match(/\bs[uú]mula\s+(\d+)\b/gi) || [];
  for (const match of sumulas) {
    const m = match.match(/(\d+)\b/);
    if (m) anchors.push({ kind: "sumula", value: m[1] });
  }

  const bareNumbers = normalized.match(/\b\d{4,}\b/g) || [];
  for (const match of bareNumbers) {
    if (!anchors.some(anchor => String(anchor.value).includes(match))) {
      anchors.push({ kind: "number", value: match });
    }
  }

  return anchors;
}

function anchorPresence(anchor, haystackRaw) {
  const raw = String(haystackRaw ?? "");
  const normalized = cleanText(raw);

  if (anchor.kind === "cnj") return raw.replace(/\D/g, "").includes(anchor.value);
  if (anchor.kind === "money") return raw.replace(/\s+/g, "").toLowerCase().includes(anchor.value);
  if (anchor.kind === "date") {
    const candidates = [
      anchor.value,
      anchor.value.replace(/\//g, "-"),
      anchor.value.replace(/\//g, ".")
    ];
    return candidates.some(value => raw.includes(value));
  }
  if (anchor.kind === "article") {
    const escaped = anchor.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\bart(?:igo)?\\.?\\s*${escaped}\\b`, "i").test(raw);
  }
  if (anchor.kind === "sumula") {
    const escaped = anchor.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\bs[uú]mula\\s+${escaped}\\b`, "i").test(raw);
  }
  return normalized.includes(anchor.value);
}

function lexicalCoverage(claim, source) {
  const claimTokens = meaningfulTokens(claim);
  const sourceTokens = new Set(meaningfulTokens(source));
  const matched = claimTokens.filter(token => sourceTokens.has(token));
  const coverage = claimTokens.length ? matched.length / claimTokens.length : 0;
  return {
    claim_token_count: claimTokens.length,
    matched_token_count: matched.length,
    matched_tokens: matched.slice(0, 40),
    coverage: Number(coverage.toFixed(4))
  };
}

function assessClaimAgainstEvidence({ claim, evidence } = {}) {
  const statement = String(claim ?? "").trim().slice(0, 12000);
  const item = evidence && typeof evidence === "object" ? evidence : {};
  const verification = item.verification || validateEvidenceItem(item);

  if (!statement) {
    return {
      ok: false, status: "claim_required", claim_support: "not_assessed",
      human_review_required: true, semantic_entailment_verified: false
    };
  }

  if (!verification.citation_ready || !verification.substantive_use_allowed) {
    return {
      ok: true,
      status: "blocked_by_evidence_validation",
      claim_support: "blocked",
      citation_ready: Boolean(verification.citation_ready),
      substantive_use_allowed: Boolean(verification.substantive_use_allowed),
      semantic_entailment_verified: false,
      human_review_required: true,
      reasons: [
        !verification.citation_ready ? "citation_not_ready" : null,
        !verification.substantive_use_allowed ? "substantive_use_not_allowed" : null
      ].filter(Boolean)
    };
  }

  const source = evidenceText(item);
  if (cleanText(source).length < 40) {
    return {
      ok: true, status: "insufficient_evidence_text", claim_support: "not_assessed",
      citation_ready: true, substantive_use_allowed: true,
      semantic_entailment_verified: false, human_review_required: true,
      reasons: ["evidence_text_too_short"]
    };
  }

  const lexical = lexicalCoverage(statement, source);
  const checkedAnchors = extractHardAnchors(statement).map(anchor => ({
    ...anchor, present: anchorPresence(anchor, source)
  }));
  const missingAnchors = checkedAnchors.filter(anchor => !anchor.present);

  let claimSupport = "weak_candidate";
  let status = "semantic_review_required";

  if (missingAnchors.length) {
    claimSupport = "not_supported_by_precheck";
    status = "hard_anchor_mismatch";
  } else if (lexical.coverage >= 0.55 && lexical.matched_token_count >= 3) {
    claimSupport = "candidate_support";
  } else if (lexical.coverage < 0.25 || lexical.matched_token_count < 2) {
    claimSupport = "not_supported_by_precheck";
  }

  return {
    ok: true,
    status,
    claim_support: claimSupport,
    citation_ready: true,
    substantive_use_allowed: true,
    lexical,
    hard_anchors: {
      total: checkedAnchors.length,
      matched: checkedAnchors.filter(anchor => anchor.present).length,
      missing: missingAnchors,
      checked: checkedAnchors
    },
    semantic_entailment_verified: false,
    safe_to_state_as_verified_claim: false,
    human_review_required: true,
    limitations: [
      "lexical_precheck_is_not_semantic_entailment",
      "absence_of_overlap_does_not_prove_falsehood",
      "candidate_support_requires_semantic_or_human_review"
    ]
  };
}

function assessClaimBatch({ claim, evidence = [] } = {}) {
  const rows = Array.isArray(evidence) ? evidence : [];
  const assessments = rows.map((item, index) => ({
    index,
    assessment: assessClaimAgainstEvidence({ claim, evidence: item })
  }));
  const counts = assessments.reduce((acc, row) => {
    const key = row.assessment.claim_support || "not_assessed";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    ok: Boolean(String(claim ?? "").trim()),
    claim: String(claim ?? "").trim().slice(0, 12000),
    assessment_count: assessments.length,
    counts,
    assessments,
    semantic_entailment_verified: false,
    human_review_required: true
  };
}

export { assessClaimAgainstEvidence, assessClaimBatch, extractHardAnchors, lexicalCoverage };
