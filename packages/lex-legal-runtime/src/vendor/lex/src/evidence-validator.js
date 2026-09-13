const OFFICIAL_HOST_SUFFIXES = [".jus.br", ".gov.br", ".leg.br"];

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function first(...values) {
  for (const value of values) {
    const v = text(value);
    if (v) return v;
  }
  return "";
}

function safeUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function isOfficialHost(hostname = "") {
  const host = text(hostname).toLowerCase();
  return OFFICIAL_HOST_SUFFIXES.some(suffix => host.endsWith(suffix));
}

function normalizeCnj(value = "") {
  const digits = text(value).replace(/\D/g, "");
  return digits.length === 20 ? digits : null;
}

function validateCnj(value = "") {
  const digits = normalizeCnj(value);
  if (!digits) return { detected: false, valid: false, normalized: null };

  const base = `${digits.slice(0, 7)}${digits.slice(9)}00`;
  const remainder = BigInt(base) % 97n;
  const expected = String(98n - remainder).padStart(2, "0");
  return {
    detected: true,
    valid: expected === digits.slice(7, 9),
    normalized: digits
  };
}

function evidenceType(item = {}) {
  const provider = first(item.provider, item.source).toLowerCase();

  if (
    provider.includes("planalto") ||
    provider.includes("senado") ||
    item.article ||
    item.artigo ||
    (item.number && item.year)
  ) return "legislation";

  if (
    provider.includes("datajud") ||
    provider.includes("cnj") ||
    item.numeroProcesso ||
    item.numero_processo
  ) return "process";

  if (
    provider.includes("stj") ||
    provider.includes("lexml") ||
    item.processo ||
    item.numero_registro ||
    item.identifier ||
    item.urn ||
    item.court_source
  ) return "precedent";

  return "other";
}

function sourceUrl(item = {}) {
  return first(
    item.record_url,
    item.permalink,
    item.source_url,
    item.url,
    item.search_url
  );
}

function primaryIdentifier(item = {}, type = evidenceType(item)) {
  if (type === "legislation") {
    const number = first(item.number, item.numero);
    const year = first(item.year, item.ano);
    const article = first(item.article, item.artigo);
    const value = [
      number ? `lei:${number}${year ? `/${year}` : ""}` : "",
      article ? `art:${article}` : ""
    ].filter(Boolean).join("#");
    return value ? { kind: "legal_reference", value } : { kind: null, value: null };
  }

  const candidate = first(
    item.processo,
    item.numeroProcesso,
    item.numero_processo,
    item.numero_registro,
    item.identifier,
    item.urn,
    item.id
  );

  if (!candidate) return { kind: null, value: null };

  const cnj = validateCnj(candidate);
  if (cnj.detected) {
    return {
      kind: "cnj",
      value: cnj.normalized,
      checksum_valid: cnj.valid
    };
  }

  return { kind: "source_identifier", value: candidate };
}

function dateMetadata(item = {}) {
  const value = first(
    item.data_publicacao,
    item.published_at,
    item.data_decisao,
    item.date,
    item.data,
    item.year,
    item.ano
  );
  return value || null;
}

function contentAvailable(item = {}) {
  return Boolean(first(
    item.content,
    item.summary,
    item.ementa,
    item.tese_juridica,
    item.decisao,
    item.title
  ));
}

function explicitValidity(item = {}) {
  const raw = first(
    item.validity_status,
    item.vigencia_status,
    item.vigencia,
    item.status_vigencia
  ).toLowerCase();

  if (!raw) return null;
  if (["vigente", "active", "in_force", "valid", "válida", "valida"].includes(raw)) return "verified_in_force";
  if (["revogada", "revoked", "expired", "sem_vigencia", "sem vigência"].includes(raw)) return "verified_not_in_force";
  return "reported_unclassified";
}

function validateEvidenceItem(item = {}) {
  const type = evidenceType(item);
  const rawUrl = sourceUrl(item);
  const url = safeUrl(rawUrl);
  const officialByUrl = Boolean(url && isOfficialHost(url.hostname));
  const officialFlag = item.official === true || item.is_official === true;
  const status = first(item.status).toLowerCase();
  const unavailable = ["error", "unavailable", "blocked", "security_challenge"].includes(status);
  const identifier = primaryIdentifier(item, type);
  const hasIdentifier = Boolean(identifier.value);
  const hasContent = contentAvailable(item);
  const date = dateMetadata(item);

  let sourceVerification = "unverified";
  if (unavailable) sourceVerification = "unavailable";
  else if (officialByUrl) sourceVerification = "official_url_verified";
  else if (officialFlag && !rawUrl) sourceVerification = "official_claim_without_url";
  else if (officialFlag && rawUrl) sourceVerification = "official_claim_unverified_url";

  const directRecordLink = Boolean(
    first(item.record_url, item.permalink) ||
    (url && /\/urn\//i.test(url.pathname))
  );

  const normativeValidity = type === "legislation"
    ? (explicitValidity(item) || "not_verified")
    : "not_applicable";

  const sourceVerified = sourceVerification === "official_url_verified";
  const identifierVerified = identifier.kind === "cnj"
    ? identifier.checksum_valid === true
    : hasIdentifier;

  const citationReady = Boolean(
    !unavailable &&
    sourceVerified &&
    identifierVerified &&
    hasContent
  );

  const substantiveUseAllowed = Boolean(
    citationReady &&
    (type !== "legislation" || normativeValidity === "verified_in_force")
  );

  const notes = [];
  if (!rawUrl) notes.push("source_url_missing");
  else if (!url) notes.push("source_url_not_https_or_invalid");
  else if (!officialByUrl) notes.push("source_host_not_recognized_as_official");
  if (!hasIdentifier) notes.push("identifier_missing");
  if (identifier.kind === "cnj" && identifier.checksum_valid === false) notes.push("cnj_checksum_invalid");
  if (!hasContent) notes.push("content_or_title_missing");
  if (!date) notes.push("date_metadata_missing");
  if (type === "legislation" && normativeValidity === "not_verified") notes.push("normative_validity_pending");
  if (unavailable) notes.push("source_unavailable");

  return {
    type,
    source_verification: sourceVerification,
    source_url: rawUrl || null,
    source_host: url?.hostname || null,
    direct_record_link: directRecordLink,
    identifier,
    date,
    citation_ready: citationReady,
    substantive_use_allowed: substantiveUseAllowed,
    normative_validity: normativeValidity,
    claim_support: "not_assessed",
    human_review_required: true,
    notes
  };
}

function validateEvidenceBatch(items = []) {
  const source = Array.isArray(items) ? items : [];
  const evidence = source.map(item => ({
    ...item,
    verification: validateEvidenceItem(item)
  }));

  const summary = {
    total: evidence.length,
    official_source_verified: evidence.filter(x => x.verification.source_verification === "official_url_verified").length,
    citation_ready: evidence.filter(x => x.verification.citation_ready).length,
    substantive_use_allowed: evidence.filter(x => x.verification.substantive_use_allowed).length,
    normative_validity_pending: evidence.filter(x => x.verification.normative_validity === "not_verified").length,
    unavailable: evidence.filter(x => x.verification.source_verification === "unavailable").length,
    claim_support_assessed: 0,
    human_review_required: true
  };

  return { evidence, summary };
}

export {
  validateEvidenceItem,
  validateEvidenceBatch,
  validateCnj,
  isOfficialHost
};
