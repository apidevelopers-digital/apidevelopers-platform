import { validateEvidenceItem } from "./evidence-validator.js";

const CLASSIFICATIONS = new Set([
  "verified_in_force",
  "verified_not_in_force",
  "partially_verified",
  "inconclusive"
]);

function clean(value, limit = 12000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalize(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function keyName(value) {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function parseDate(value) {
  const raw = clean(value, 80);
  if (!raw) return null;

  let m = raw.match(/\b((?:18|19|20|21)\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = raw.match(/\b([0-2]?\d|3[01])[\/.\-](0?\d|1[0-2])[\/.\-]((?:18|19|20|21)\d{2})\b/);
  if (!m) return null;
  const day = String(Number(m[1])).padStart(2, "0");
  const month = String(Number(m[2])).padStart(2, "0");
  return `${m[3]}-${month}-${day}`;
}

function flatten(value, out = [], depth = 0) {
  if (depth > 5 || out.length > 600 || value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    for (const child of value.slice(0, 50)) flatten(child, out, depth + 1);
    return out;
  }
  if (typeof value === "object") {
    for (const [k, child] of Object.entries(value)) {
      if (k === "verification") continue;
      if (child !== null && typeof child !== "object") out.push({ key: keyName(k), value: child });
      else flatten(child, out, depth + 1);
    }
  }
  return out;
}

function parseEmbeddedJson(item = {}) {
  for (const candidate of [item.raw, item.metadata, item.content, item.conteudo]) {
    if (candidate && typeof candidate === "object") return candidate;
    const text = clean(candidate, 4_000_000);
    if (!/^[\[{]/.test(text)) continue;
    try { return JSON.parse(text); } catch {}
  }
  return null;
}

function pick(entries, names) {
  const wanted = new Set(names);
  return entries.find((entry) => wanted.has(entry.key) && clean(entry.value, 400))?.value ?? null;
}

function pickDate(entries, names) {
  const wanted = new Set(names);
  for (const entry of entries) {
    if (!wanted.has(entry.key)) continue;
    const parsed = parseDate(entry.value);
    if (parsed) return parsed;
  }
  return null;
}

function statusOf(value) {
  if (typeof value === "boolean") return value ? "revoked" : null;
  const s = normalize(value);
  if (!s) return null;
  if (/(revogad|sem vigencia|nao vigente|fora de vigor|revoked|expired|not in force)/.test(s)) return "revoked";
  if (/(vacatio|nao entrou em vigor|not yet in force)/.test(s)) return "not_yet_in_force";
  if (/(^|[^a-z])(vigente|em vigor|in force|active|valid)([^a-z]|$)/.test(s)) return "active";
  return null;
}

function collectSignals(item = {}) {
  const entries = flatten({ item, embedded: parseEmbeddedJson(item) });
  const text = normalize([
    item.title, item.titulo, item.content, item.conteudo, item.text, item.trecho, item.summary, item.resumo
  ].filter(Boolean).join("\n"));

  const articleSpecific = Boolean(clean(item.article || item.artigo, 80));

  return {
    explicit_status: statusOf(pick(entries, [
      "validitystatus", "vigenciastatus", "statusvigencia", "situacaovigencia",
      "situacaonorma", "indicadorrevogado", "revogado", "revogada", "vigencia"
    ])),
    effective_from: pickDate(entries, [
      "effectivefrom", "vigenciainicio", "iniciovigencia", "datainiciovigencia",
      "datavigencia", "dataeficacia", "inicioeficacia"
    ]),
    effective_to: pickDate(entries, [
      "effectiveto", "vigenciafim", "fimvigencia", "datafimvigencia",
      "datarevogacao", "datarevogada", "fimdosefeitos", "datafimdosefeitos"
    ]),
    version_from: pickDate(entries, [
      "versioneffectivefrom", "versaoinicio", "datainicioversao", "dataredacao", "versiondate"
    ]),
    version_to: pickDate(entries, [
      "versioneffectiveto", "versaofim", "datafimversao"
    ]),
    revoked_by: clean(pick(entries, [
      "revokedby", "revogadopor", "revogadapela", "atorevogador", "normarevogadora"
    ]), 400) || null,
    compiled_text: /\btexto compilado\b|\btexto atualizado\b/.test(text),
    amended_markers: /\bredacao dada pela\b|\bredacao dada pelo\b|\bincluido pela\b|\bincluido pelo\b|\balterado pela\b|\balterado pelo\b/.test(text),
    revocation_marker: articleSpecific
      ? /\b(revogado|revogada)\b/.test(text.slice(0, 8000))
      : /\b(revogado pelo|revogada pela|revogado por|revogada por)\b/.test(text.slice(0, 3500))
  };
}

function inRange(target, start, end) {
  return (!start || target >= start) && (!end || target < end);
}

function assessNormativeValidity({ evidence, as_of_date, now = new Date() } = {}) {
  const target = parseDate(as_of_date);
  if (!target) {
    return {
      ok: false,
      status: "as_of_date_invalid",
      classification: "inconclusive",
      human_review_required: true,
      final_legal_conclusion_allowed: false,
      normative_temporal_use_allowed: false
    };
  }

  const item = evidence && typeof evidence === "object" ? evidence : {};
  const verification = item.verification || validateEvidenceItem(item);
  const signals = collectSignals(item);
  const today = now.toISOString().slice(0, 10);
  const current = target === today;
  const official = verification.source_verification === "official_url_verified";
  const reasons = [];

  if (!official) reasons.push("official_source_not_verified");

  let version_status = "version_not_verified";
  if (signals.version_from || signals.version_to) {
    version_status = inRange(target, signals.version_from, signals.version_to)
      ? "explicit_version_for_date"
      : "explicit_version_outside_date";
  } else if (current && signals.compiled_text) {
    version_status = "current_compiled_text";
  } else if (!current && signals.compiled_text) {
    version_status = signals.amended_markers
      ? "historical_version_not_verified_amendments_present"
      : "historical_version_not_verified";
  }

  let classification = "inconclusive";
  let norm_status = "unknown";
  let temporal_basis = "insufficient";

  if (official && signals.effective_from && target < signals.effective_from) {
    classification = "verified_not_in_force";
    norm_status = "not_in_force";
    temporal_basis = "effective_from";
    reasons.push("target_precedes_effective_from");
  } else if (official && signals.effective_to && target >= signals.effective_to) {
    classification = "verified_not_in_force";
    norm_status = "not_in_force";
    temporal_basis = "effective_to";
    reasons.push("target_on_or_after_effective_to");
  } else if (
    official &&
    signals.effective_from &&
    signals.effective_to &&
    inRange(target, signals.effective_from, signals.effective_to)
  ) {
    norm_status = "in_force";
    temporal_basis = "explicit_interval";
    classification = version_status === "explicit_version_for_date"
      ? "verified_in_force"
      : "partially_verified";
    if (classification === "partially_verified") reasons.push("text_version_not_verified_for_date");
  } else if (official && current && (signals.explicit_status === "revoked" || signals.revocation_marker)) {
    classification = "verified_not_in_force";
    norm_status = "not_in_force";
    temporal_basis = "explicit_current_revocation";
    reasons.push("explicit_current_revocation");
  } else if (official && current && signals.explicit_status === "not_yet_in_force") {
    classification = "verified_not_in_force";
    norm_status = "not_in_force";
    temporal_basis = "explicit_current_status";
    reasons.push("explicit_not_yet_in_force_status");
  } else if (official && current && signals.explicit_status === "active") {
    norm_status = "in_force";
    temporal_basis = "explicit_current_status";
    classification = ["current_compiled_text", "explicit_version_for_date"].includes(version_status)
      ? "verified_in_force"
      : "partially_verified";
    if (classification === "partially_verified") reasons.push("current_text_version_not_verified");
  } else if (
    official &&
    !current &&
    signals.explicit_status === "active" &&
    signals.effective_from &&
    target >= signals.effective_from
  ) {
    norm_status = "in_force";
    temporal_basis = "current_status_plus_effective_from";
    classification = version_status === "explicit_version_for_date"
      ? "verified_in_force"
      : "partially_verified";
    if (classification === "partially_verified") reasons.push("historical_text_version_not_verified");
  } else {
    reasons.push("temporal_validity_not_explicitly_verified");
  }

  if (
    !current &&
    signals.revocation_marker &&
    !signals.effective_to &&
    classification !== "verified_not_in_force"
  ) {
    classification = "inconclusive";
    norm_status = "unknown";
    temporal_basis = "revocation_date_missing";
    reasons.push("revocation_date_missing_for_historical_date");
  }

  if (!CLASSIFICATIONS.has(classification)) classification = "inconclusive";

  return {
    ok: true,
    status: classification === "inconclusive"
      ? "normative_validity_inconclusive"
      : "normative_validity_assessed",
    classification,
    as_of_date: target,
    current_date: today,
    norm_status,
    temporal_basis,
    version_status,
    effective_from: signals.effective_from,
    effective_to: signals.effective_to,
    version_effective_from: signals.version_from,
    version_effective_to: signals.version_to,
    revoked_by: signals.revoked_by,
    explicit_status: signals.explicit_status,
    explicit_revocation_marker: signals.revocation_marker,
    compiled_text_detected: signals.compiled_text,
    amendments_detected: signals.amended_markers,
    source_verification: verification.source_verification,
    source_url: verification.source_url || item.source_url || item.url || null,
    official_source_verified: official,
    normative_temporal_use_allowed: classification === "verified_in_force",
    safe_to_state_as_current_text:
      classification === "verified_in_force" &&
      ["current_compiled_text", "explicit_version_for_date"].includes(version_status),
    human_review_required: true,
    final_legal_conclusion_allowed: false,
    no_invention_policy: true,
    reasons: [...new Set(reasons)]
  };
}

export {
  assessNormativeValidity,
  collectSignals,
  parseDate,
  statusOf
};
