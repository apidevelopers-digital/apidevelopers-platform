import { randomUUID } from "node:crypto";

const SAFE_PATH_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const ROUTES = Object.freeze([
  {
    pattern: /^\/v1\/family\/purchases$/,
    kind: "purchaseList",
    action: "family.purchase.list",
    scopes: ["family:purchases:read"],
    query: new Set(["date_from", "date_to", "merchant_id", "status", "limit"])
  },
  {
    pattern: /^\/v1\/family\/purchases\/([^/]+)$/,
    kind: "purchaseGet",
    action: "family.purchase.get",
    scopes: ["family:purchases:read"],
    query: new Set(["include_items", "include_payment", "include_provenance"])
  },
  {
    pattern: /^\/v1\/family\/products\/([^/]+)\/stats$/,
    kind: "productStats",
    action: "family.product.stats",
    scopes: ["family:products:read", "family:finance:read"],
    query: new Set(["date_from", "date_to"])
  },
  {
    pattern: /^\/v1\/family\/products\/([^/]+)\/price-history$/,
    kind: "productPriceHistory",
    action: "family.product.price_history",
    scopes: ["family:products:read", "family:finance:read"],
    query: new Set(["merchant_id", "date_from", "date_to", "limit"])
  },
  {
    pattern: /^\/v1\/family\/context\/chef$/,
    kind: "chefContext",
    action: "family.context.chef",
    scopes: ["family:chef_context:read"],
    query: new Set(["window_days"])
  },
  {
    pattern: /^\/v1\/family\/evidence\/([^/]+)$/,
    kind: "evidenceGet",
    action: "family.evidence.get",
    scopes: ["family:evidence:read"],
    query: new Set(["mode"])
  }
]);

function jsonResponse(status, payload, headers = {}) {
  return {
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      ...headers
    }),
    body: JSON.stringify(payload)
  };
}

function readHeader(headers, name) {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === expected) return String(value ?? "").trim() || undefined;
  }
  return undefined;
}

function safePathId(raw) {
  let value;
  try {
    value = decodeURIComponent(raw);
  } catch {
    throw new TypeError("resource_id_invalid");
  }
  if (!SAFE_PATH_ID.test(value)) throw new TypeError("resource_id_invalid");
  return value;
}

function route(pathname) {
  for (const candidate of ROUTES) {
    const match = pathname.match(candidate.pattern);
    if (match) {
      return {
        ...candidate,
        id: match[1] ? safePathId(match[1]) : undefined
      };
    }
  }
  return null;
}

function rejectUnknownQuery(searchParams, allowed) {
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) throw new TypeError(`query_not_supported:${key}`);
  }
}

function optionalBoolean(searchParams, name, fallback) {
  const raw = searchParams.get(name);
  if (raw === null) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new TypeError(`${name}_invalid`);
}

function optionalInt(searchParams, name, fallback, max) {
  const raw = searchParams.get(name);
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) throw new TypeError(`${name}_invalid`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new RangeError(`${name}_invalid`);
  }
  return value;
}

function baseArgs(searchParams, tenantId, requestId) {
  return {
    tenant_id: tenantId,
    request_id: requestId,
    date_from: searchParams.get("date_from") ?? undefined,
    date_to: searchParams.get("date_to") ?? undefined,
    merchant_id: searchParams.get("merchant_id") ?? undefined,
    status: searchParams.get("status") ?? undefined
  };
}

function requiredScopes(matched, searchParams) {
  const scopes = [...matched.scopes];
  if (
    matched.kind === "purchaseGet"
    && optionalBoolean(searchParams, "include_payment", true)
  ) {
    scopes.push("family:finance:read");
  }
  return scopes;
}

function argsFor(matched, searchParams, tenantId, requestId) {
  const base = baseArgs(searchParams, tenantId, requestId);
  switch (matched.kind) {
    case "purchaseList":
      return {
        ...base,
        limit: optionalInt(searchParams, "limit", 50, 200)
      };
    case "purchaseGet":
      return {
        tenant_id: tenantId,
        request_id: requestId,
        purchase_id: matched.id,
        include_items: optionalBoolean(searchParams, "include_items", true),
        include_payment: optionalBoolean(searchParams, "include_payment", true),
        include_provenance: optionalBoolean(searchParams, "include_provenance", true)
      };
    case "productStats":
      return {
        tenant_id: tenantId,
        request_id: requestId,
        product_id: matched.id,
        date_from: base.date_from,
        date_to: base.date_to
      };
    case "productPriceHistory":
      return {
        tenant_id: tenantId,
        request_id: requestId,
        product_id: matched.id,
        merchant_id: base.merchant_id,
        date_from: base.date_from,
        date_to: base.date_to,
        limit: optionalInt(searchParams, "limit", 200, 500)
      };
    case "chefContext":
      return {
        tenant_id: tenantId,
        request_id: requestId,
        window_days: optionalInt(searchParams, "window_days", 365, 3650)
      };
    case "evidenceGet": {
      const mode = searchParams.get("mode") ?? "metadata";
      if (mode !== "metadata") {
        const error = new Error("evidence_content_forbidden");
        error.code = "evidence_content_forbidden";
        throw error;
      }
      return {
        tenant_id: tenantId,
        request_id: requestId,
        evidence_id: matched.id,
        mode
      };
    }
    default:
      throw new TypeError("route_not_supported");
  }
}

function notFoundFor(kind, result) {
  if (kind === "purchaseGet") return result?.data?.purchase === null;
  if (kind === "evidenceGet") return result?.data?.evidence === null;
  return false;
}

export function createFamilyDataReadonlyHttpApp({
  app,
  authenticator,
  authorization,
  store,
  requestIdFactory = () => randomUUID()
} = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest must be a function");
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator.authenticate must be a function");
  if (typeof authorization?.decide !== "function") throw new TypeError("authorization.decide must be a function");

  const methods = [
    "purchaseList",
    "purchaseGet",
    "productStats",
    "productPriceHistory",
    "chefContext",
    "evidenceGet"
  ];
  for (const method of methods) {
    if (typeof store?.[method] !== "function") {
      throw new TypeError(`store.${method} must be a function`);
    }
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      let parsed;
      let matched;
      try {
        parsed = new URL(request.url ?? "/", "http://gateway.local");
        matched = route(parsed.pathname);
      } catch (error) {
        if (error instanceof TypeError) {
          return jsonResponse(400, {
            error: "invalid_family_data_request",
            message: error.message
          });
        }
        throw error;
      }

      if (!matched) return app.handleRequest(request);

      const method = String(request.method ?? "GET").toUpperCase();
      if (method !== "GET") {
        return jsonResponse(405, { error: "method_not_allowed" }, { allow: "GET" });
      }

      try {
        rejectUnknownQuery(parsed.searchParams, matched.query);

        const identity = await authenticator.authenticate(request.headers ?? {});
        if (!identity) return jsonResponse(401, { error: "unauthorized" });

        const tenantId = identity.principal?.tenantId;
        if (!tenantId) return jsonResponse(403, { error: "tenant_context_unavailable" });

        const requestId =
          readHeader(request.headers, "x-request-id")
          ?? readHeader(request.headers, "x-correlation-id")
          ?? requestIdFactory();

        const scopes = requiredScopes(matched, parsed.searchParams);
        const decision = authorization.decide({
          identity,
          action: matched.action,
          resource: `tenant:${tenantId}:family-data`,
          requiredScopes: scopes
        });
        if (decision?.effect !== "allow") {
          return jsonResponse(403, {
            error: "forbidden",
            authorizationDecision: decision
          });
        }

        const args = argsFor(matched, parsed.searchParams, tenantId, requestId);
        const result = await store[matched.kind](args);
        return jsonResponse(notFoundFor(matched.kind, result) ? 404 : 200, result);
      } catch (error) {
        if (error?.code === "tenant_forbidden" || error?.code === "evidence_content_forbidden") {
          return jsonResponse(403, { error: error.code });
        }
        if (
          error instanceof TypeError
          || error instanceof RangeError
          || String(error?.code ?? "").endsWith("_invalid")
        ) {
          return jsonResponse(400, {
            error: "invalid_family_data_request",
            message: error.message
          });
        }
        throw error;
      }
    }
  });
}
