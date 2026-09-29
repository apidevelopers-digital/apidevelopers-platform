export const MITRA_JURISPRUDENCE_PROVIDER_ADAPTER_ID = "mitra.buscar_jurisprudencia";

function safeText(value, max = 500) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, max);
}

function normalizeDate(value, field) {
  const text = safeText(value, 20);
  if (!text) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return { error: "invalid_query", reason: `invalid_${field}` };
  }
  return text;
}

function normalizeLimit(value) {
  if (value === undefined || value === null || value === "") return 5;
  const limit = Number.parseInt(String(value), 10);
  if (!Number.isFinite(limit) || limit < 1) {
    return { error: "invalid_query", reason: "invalid_limit" };
  }
  return Math.min(limit, 10);
}

export function normalizeJurisprudenceProviderQuery(input = {}) {
  const q = safeText(input.q, 240);
  if (!q || q.length < 3) {
    return { ok: false, error: "invalid_query", reason: "q_min_length_3_required" };
  }

  const periodFrom = normalizeDate(input.periodFrom, "periodFrom");
  if (periodFrom?.error) return { ok: false, ...periodFrom };

  const periodTo = normalizeDate(input.periodTo, "periodTo");
  if (periodTo?.error) return { ok: false, ...periodTo };

  const limit = normalizeLimit(input.limit);
  if (limit?.error) return { ok: false, ...limit };

  return {
    ok: true,
    query: Object.freeze({
      q,
      ...(safeText(input.tribunal, 40) ? { tribunal: safeText(input.tribunal, 40) } : {}),
      ...(periodFrom ? { periodFrom } : {}),
      ...(periodTo ? { periodTo } : {}),
      limit,
    }),
  };
}

export function createJurisprudenceReadOnlyContext(identity) {
  const principal = identity?.principal ?? {};
  return Object.freeze({
    adapterId: MITRA_JURISPRUDENCE_PROVIDER_ADAPTER_ID,
    access: "read_only",
    rawSqlAllowed: false,
    writeAllowed: false,
    identity: Object.freeze({
      role: identity?.role ?? "unknown",
      principal: Object.freeze({
        ...(principal.id ? { id: principal.id } : {}),
        ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
        scopes: Array.isArray(principal.scopes) ? [...principal.scopes] : [],
      }),
    }),
  });
}

function normalizeProviderResult(result) {
  return Object.freeze({
    ...(safeText(result?.id, 120) ? { id: safeText(result.id, 120) } : {}),
    ...(safeText(result?.title, 300) ? { title: safeText(result.title, 300) } : {}),
    ...(safeText(result?.source, 120) ? { source: safeText(result.source, 120) } : {}),
    ...(safeText(result?.url, 500) ? { url: safeText(result.url, 500) } : {}),
    ...(safeText(result?.court, 80) ? { court: safeText(result.court, 80) } : {}),
    ...(safeText(result?.date, 40) ? { date: safeText(result.date, 40) } : {}),
    ...(safeText(result?.summary, 1000) ? { summary: safeText(result.summary, 1000) } : {}),
  });
}

export function normalizeJurisprudenceProviderOutput(output, limit = 5) {
  const rawResults = Array.isArray(output) ? output : output?.results;
  if (!Array.isArray(rawResults)) return [];
  return rawResults
    .map(normalizeProviderResult)
    .filter((result) => Object.keys(result).length > 0)
    .slice(0, Math.min(Math.max(limit, 1), 10));
}

export function createMitraJurisprudenceProviderRunner({ provider } = {}) {
  if (provider !== undefined && typeof provider?.search !== "function") {
    throw new TypeError("provider.search must be a function");
  }

  return Object.freeze({
    enabled: Boolean(provider),

    async search(input, identity) {
      const normalized = normalizeJurisprudenceProviderQuery(input);
      if (!normalized.ok) {
        return Object.freeze({
          ok: false,
          status: 400,
          error: normalized.error,
          reason: normalized.reason,
          writeExecuted: false,
        });
      }

      if (!provider) {
        return Object.freeze({
          ok: false,
          status: 503,
          error: "dependency_unavailable",
          reason: "jurisprudence_source_not_connected",
          executionStatus: "provider_contract_ready",
          writeExecuted: false,
        });
      }

      const context = createJurisprudenceReadOnlyContext(identity);
      const output = await provider.search(normalized.query, context);
      return Object.freeze({
        ok: true,
        status: 200,
        executionStatus: "read_only_provider_result",
        query: normalized.query,
        results: Object.freeze(normalizeJurisprudenceProviderOutput(output, normalized.query.limit)),
        writeExecuted: false,
        rawSqlAllowed: false,
        writeAllowed: false,
      });
    },
  });
}
