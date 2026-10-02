const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const MAX_QUERY_LENGTH = 500;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const SAFE_RESULT_KEYS = Object.freeze(new Set(["id", "title", "source", "url", "court", "date", "summary"]));

function jsonResponse(status, payload, headers = { "content-type": "application/json; charset=utf-8" }) {
  return { status, headers, body: JSON.stringify(payload) };
}

function text(value, max = 500) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, max);
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

function normalizeDateParam(value) {
  const normalized = text(value, 40);
  if (!normalized) return "";
  return DATE_PATTERN.test(normalized) ? normalized : "";
}

function normalizeResult(result) {
  const source = result && typeof result === "object" ? result : {};
  const next = {};

  for (const key of SAFE_RESULT_KEYS) {
    const value = text(source[key], key === "summary" ? 1_200 : 500);
    if (value) next[key] = value;
  }

  return Object.freeze(next);
}

function parseBridgePayload(result) {
  try {
    const parsed = JSON.parse(result?.body ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function publicPayloadFromBridgePayload(payload) {
  const results = Array.isArray(payload.results)
    ? payload.results.map(normalizeResult).filter((item) => Object.keys(item).length > 0)
    : [];

  return Object.freeze({
    ok: payload.ok === true,
    adapterId: text(payload.adapterId, 180) || "mitra.buscar_jurisprudencia",
    source: "Mitra Jurisprudência Pública",
    results: Object.freeze(results),
    ...(text(payload.legalWarning, 500) ? { legalWarning: text(payload.legalWarning, 500) } : {}),
    ...(text(payload.queriedAt, 120) ? { queriedAt: text(payload.queriedAt, 120) } : {}),
  });
}

function buildInternalUrl(requestUrl) {
  const input = new URL(String(requestUrl), "http://api-gateway.local");
  const q = text(input.searchParams.get("q"), MAX_QUERY_LENGTH);
  if (!q) return { error: "query_required" };

  const internal = new URL("/v1/ada/mitra/legal/jurisprudencia", "http://api-gateway.local");
  internal.searchParams.set("q", q);

  const tribunal = text(input.searchParams.get("tribunal"), 40);
  if (tribunal) internal.searchParams.set("tribunal", tribunal);

  const periodFrom = normalizeDateParam(input.searchParams.get("periodFrom"));
  if (periodFrom) internal.searchParams.set("periodFrom", periodFrom);

  const periodTo = normalizeDateParam(input.searchParams.get("periodTo"));
  if (periodTo) internal.searchParams.set("periodTo", periodTo);

  internal.searchParams.set("limit", String(normalizeLimit(input.searchParams.get("limit"))));

  return { url: `${internal.pathname}?${internal.searchParams.toString()}` };
}

function internalHeaders({ readToken, tenantId }) {
  return Object.freeze({
    "x-api-key": readToken,
    "x-tenant-id": tenantId,
    "x-public-facade": "mitra-public-jurisprudencia",
    accept: "application/json",
  });
}

export function createMitraPublicJurisprudenciaFacade({
  adaMitraBridge,
  env = process.env,
} = {}) {
  if (adaMitraBridge !== undefined && typeof adaMitraBridge?.handleRequest !== "function") {
    throw new TypeError("adaMitraBridge.handleRequest must be a function");
  }

  return Object.freeze({
    async handleRequest({
      method = "GET",
      url = "/",
    } = {}) {
      const normalizedMethod = String(method).toUpperCase();
      const requestUrl = new URL(String(url), "http://api-gateway.local");

      if (requestUrl.pathname !== "/v1/mitra/public/jurisprudencia") return null;

      if (normalizedMethod !== "GET") {
        return jsonResponse(405, {
          ok: false,
          error: "method_not_allowed",
        });
      }

      if (!adaMitraBridge) {
        return jsonResponse(503, {
          ok: false,
          error: "mitra_bridge_unavailable",
        });
      }

      const readToken = text(env.ADA_MITRA_MCP_V1_READ_TOKEN, 2_000);
      const tenantId = text(env.ADA_MITRA_BRIDGE_TENANT_ID, 500);

      if (!readToken || !tenantId) {
        return jsonResponse(503, {
          ok: false,
          error: "public_jurisprudencia_credentials_unavailable",
        });
      }

      const built = buildInternalUrl(requestUrl);
      if (built.error) {
        return jsonResponse(400, {
          ok: false,
          error: built.error,
        });
      }

      const bridgeResponse = await adaMitraBridge.handleRequest({
        method: "GET",
        url: built.url,
        headers: internalHeaders({ readToken, tenantId }),
      });

      if (!bridgeResponse) {
        return jsonResponse(502, {
          ok: false,
          error: "mitra_bridge_no_response",
        });
      }

      const bridgePayload = parseBridgePayload(bridgeResponse);
      const publicPayload = publicPayloadFromBridgePayload(bridgePayload);

      if (bridgeResponse.status !== 200 || bridgePayload.ok !== true) {
        return jsonResponse(bridgeResponse.status || 502, {
          ok: false,
          error: text(bridgePayload.error || bridgePayload.reason, 180) || "public_jurisprudencia_failed",
          adapterId: publicPayload.adapterId,
          results: publicPayload.results,
        });
      }

      return jsonResponse(200, publicPayload);
    },
  });
}
