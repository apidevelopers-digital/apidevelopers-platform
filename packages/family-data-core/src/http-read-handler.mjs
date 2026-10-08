const ROUTES = [
  { re: /^\/v1\/family\/purchases$/, scope: "family:purchases:read", method: "purchaseList" },
  { re: /^\/v1\/family\/purchases\/([A-Za-z0-9._:-]{1,128})$/, scope: "family:purchases:read", method: "purchaseGet", id: "purchase_id" },
  { re: /^\/v1\/family\/products\/([A-Za-z0-9._:-]{1,128})\/stats$/, scope: "family:products:read", method: "productStats", id: "product_id" },
  { re: /^\/v1\/family\/products\/([A-Za-z0-9._:-]{1,128})\/price-history$/, scope: "family:products:read", method: "productPriceHistory", id: "product_id" },
  { re: /^\/v1\/family\/context\/chef$/, scope: "family:chef_context:read", method: "chefContext" },
  { re: /^\/v1\/family\/evidence\/([A-Za-z0-9._:-]{1,128})$/, scope: "family:evidence:read", method: "evidenceGet", id: "evidence_id" }
];

const QUERY_FIELDS = Object.freeze({
  purchaseList: new Set(["date_from", "date_to", "merchant_id", "status", "limit"]),
  purchaseGet: new Set(["include_items", "include_payment", "include_provenance"]),
  productStats: new Set(["date_from", "date_to"]),
  productPriceHistory: new Set(["merchant_id", "date_from", "date_to", "limit"]),
  chefContext: new Set(["window_days"]),
  evidenceGet: new Set(["mode"])
});

function response(status, body) {
  return { status, headers: { "content-type": "application/json" }, body };
}

function queryObject(query = {}) {
  if (query instanceof URLSearchParams) return Object.fromEntries(query.entries());
  return { ...query };
}

function parsePositiveInt(value, name, max) {
  if (value == null || value === "") return undefined;
  if (!/^\d+$/.test(String(value))) throw Object.assign(new Error(`${name}_invalid`), { code: `${name}_invalid` });
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw Object.assign(new Error(`${name}_invalid`), { code: `${name}_invalid` });
  }
  return parsed;
}

function parseBool(value, name) {
  if (value == null || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  throw Object.assign(new Error(`${name}_invalid`), { code: `${name}_invalid` });
}

function normalizeQuery(method, raw) {
  const allowed = QUERY_FIELDS[method];
  const unknown = Object.keys(raw).filter((key) => !allowed.has(key));
  if (unknown.length) throw Object.assign(new Error(`query_not_supported:${unknown[0]}`), { code: "query_not_supported" });

  const out = { ...raw };
  if ("limit" in out) out.limit = parsePositiveInt(out.limit, "limit", method === "productPriceHistory" ? 500 : 200);
  if ("window_days" in out) out.window_days = parsePositiveInt(out.window_days, "window_days", 3650);
  for (const key of ["include_items", "include_payment", "include_provenance"]) {
    if (key in out) out[key] = parseBool(out[key], key);
  }
  if (method === "evidenceGet") {
    const mode = out.mode ?? "metadata";
    if (mode !== "metadata") throw Object.assign(new Error("evidence_content_forbidden"), { code: "evidence_content_forbidden" });
    out.mode = "metadata";
  }
  return out;
}

export function createFamilyDataHttpReadHandler({
  store,
  tenantId = "homosapiens-id",
  authorize = async () => false,
  requestId = () => crypto.randomUUID?.() ?? `req_${Date.now()}`
} = {}) {
  if (!store) throw new TypeError("store is required");

  return async function handle(req = {}) {
    if (String(req.method ?? "GET").toUpperCase() !== "GET") {
      return response(405, { ok: false, error: "method_not_allowed" });
    }

    const path = String(req.path ?? "");
    const route = ROUTES.map((candidate) => ({ candidate, match: candidate.re.exec(path) }))
      .find((entry) => entry.match);
    if (!route) return response(404, { ok: false, error: "route_not_found" });

    const headers = Object.fromEntries(
      Object.entries(req.headers ?? {}).map(([key, value]) => [String(key).toLowerCase(), value])
    );
    const presentedTenant = String(headers["x-tenant-id"] ?? tenantId);
    if (presentedTenant !== tenantId) return response(403, { ok: false, error: "tenant_forbidden" });

    const allowed = await authorize({ scope: route.candidate.scope, request: req, tenant_id: tenantId });
    if (!allowed) return response(403, { ok: false, error: "scope_forbidden", scope: route.candidate.scope });

    try {
      const query = normalizeQuery(route.candidate.method, queryObject(req.query));
      const args = {
        tenant_id: tenantId,
        request_id: String(headers["x-request-id"] ?? requestId()),
        ...query
      };
      if (route.candidate.id) args[route.candidate.id] = route.match[1];

      const result = await store[route.candidate.method](args);
      if (
        (route.candidate.method === "purchaseGet" && result?.data?.purchase == null) ||
        (route.candidate.method === "evidenceGet" && result?.data?.evidence == null)
      ) {
        return response(404, { ok: false, error: "not_found", request_id: args.request_id });
      }
      return response(200, result);
    } catch (error) {
      const code = error?.code ?? error?.message ?? "internal_error";
      if (code === "tenant_forbidden" || code === "evidence_content_forbidden") {
        return response(403, { ok: false, error: code });
      }
      if (
        code.endsWith?.("_invalid") ||
        code === "query_not_supported"
      ) {
        return response(400, { ok: false, error: code });
      }
      return response(500, { ok: false, error: "internal_error" });
    }
  };
}
