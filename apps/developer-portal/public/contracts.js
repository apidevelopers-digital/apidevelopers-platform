export function normalizeInstitutional(payload = {}) {
  const data = payload?.data || payload?.snapshot || payload || {};
  return {
    summary: data.summary || {},
    records: Array.isArray(data.records) ? data.records : [],
    modules: Array.isArray(data.modules) ? data.modules : [],
    versions: Array.isArray(data.versions) ? data.versions : [],
    integrity: data.integrity || { status: "unknown", sources: [], warnings: [] },
    meta: payload?.meta || data.meta || {},
  };
}

export function normalizeLearning(payload = {}) {
  const data = payload?.data || payload?.learning || payload || {};
  const sections = data.sections || {};
  return {
    memories: Array.isArray(data.memories) ? data.memories : Array.isArray(sections.memories) ? sections.memories : [],
    findings: Array.isArray(data.findings) ? data.findings : Array.isArray(sections.findings) ? sections.findings : [],
    proposals: Array.isArray(data.proposals) ? data.proposals : Array.isArray(sections.proposals) ? sections.proposals : [],
    evidence: Array.isArray(data.evidence) ? data.evidence : Array.isArray(sections.evidence) ? sections.evidence : [],
    summary: data.summary || {},
    meta: payload?.meta || data.meta || {},
  };
}

export function classifyResponseState({ status, error = null, meta = {}, hasData = true } = {}) {
  if (status === 401 || status === 403) return { kind: "policy", retryable: false };
  if (error) return { kind: "error", retryable: error.retryable !== false };
  if (meta.stale === true) return { kind: "stale", retryable: true };
  if (!hasData) return { kind: "empty", retryable: false };
  return { kind: "ready", retryable: false };
}
