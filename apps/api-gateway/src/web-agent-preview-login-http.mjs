export const uniCoPreviewLoginHttpPath = "/v1/web-agent/session/login";
export const uniCoPreviewSurfaceHostHeader = "x-apidevelopers-surface-host";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
});

const ALLOWED_LOGIN_ORIGINS = Object.freeze(new Set([
  "https://mitra-preview.apidevelopers.digital",
  "https://mitra.apidevelopers.digital",
  "https://uni-preview.apidevelopers.digital",
  "https://unico-preview.apidevelopers.digital",
]));

const CUSTOMER_PROVISIONING_CODES = Object.freeze([
  "preview_assisted_provisioning_response_unclassified",
  "uni_co_provisioning_not_complete",
  "uni_co_product_mismatch",
  "uni_co_tenantId_required",
  "uni_co_workspaceId_required",
  "uni_co_principalId_required",
  "uni_co_accessGrantId_required",
  "uni_co_customer_tenant_not_active",
  "uni_co_customer_workspace_not_active",
  "uni_co_customer_access_grant_not_resolved",
  "uni_co_customer_membership_failed",
  "uni_co_customer_account_not_ready",
]);

const SAFE_LOGIN_ERROR_CODES = Object.freeze(new Set([
  "invalid_credentials",
  "too_many_login_attempts",
  "preview_identity_verification_failed",
  "preview_identity_backend_unavailable",
  "preview_identity_session_missing",
  "preview_identity_binding_invalid",
  "preview_identity_product_not_supported",
  "preview_assisted_provisioning_invalid",
  "access_grant_not_found",
  "access_grant_ambiguous",
  "access_not_found",
  "active_access_grant_scope_mismatch",
  "uni_account_access_not_found",
  "uni_account_access_unavailable",
  "preview_identity_binding_required",
  "preview_identity_binding_mismatch",
  "preview_product_not_allowed",
  "preview_login_product_mismatch",
  "preview_login_surface_not_allowed",
  ...CUSTOMER_PROVISIONING_CODES,
]));

function response(status, payload, headers = {}) {
  return Object.freeze({
    status,
    headers: Object.freeze({ ...JSON_HEADERS, ...headers }),
    body: JSON.stringify(payload),
  });
}

function emptyResponse(status, headers = {}) {
  return Object.freeze({ status, headers: Object.freeze({ ...headers }), body: "" });
}

function readHeader(headers, name) {
  if (typeof headers?.get === "function") return headers.get(name);
  return headers?.[name];
}

function headerText(headers, name) {
  const value = readHeader(headers, name);
  if (Array.isArray(value)) return value.length === 1 ? String(value[0] ?? "").trim().toLowerCase() : "";
  return String(value ?? "").trim().toLowerCase();
}

function resolveSurfaceHost(headers) {
  return headerText(headers, uniCoPreviewSurfaceHostHeader) || headerText(headers, "host");
}

function resolveOrigin(headers) {
  const origin = readHeader(headers, "origin") ?? readHeader(headers, "Origin");
  return String(origin ?? "").trim().toLowerCase().replace(/\/+$/, "");
}

function corsHeaders(headers) {
  const origin = resolveOrigin(headers);
  if (!origin || !ALLOWED_LOGIN_ORIGINS.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": [
      "content-type",
      "accept",
      uniCoPreviewSurfaceHostHeader,
    ].join(", "),
    "access-control-max-age": "600",
    vary: "origin, access-control-request-headers",
  };
}

function parseJsonBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  if (typeof body !== "string" || body.trim() === "") {
    const error = new Error("invalid_json");
    error.status = 400;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    const error = new Error("invalid_json");
    error.status = 400;
    throw error;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error("invalid_json");
    error.status = 400;
    throw error;
  }
  return parsed;
}

function safeDiagnostic(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!/^(diagnosticStage|provisioning[A-Z][A-Za-z0-9]*|accountReady|productIdPresent|tenantIdPresent|workspaceIdPresent|principalIdPresent|accessGrantIdPresent|reasonPresent|diagnosticStagePresent|secretsExposed)$/.test(key)) continue;
    if (typeof raw === "boolean") out[key] = raw;
    else if (key === "diagnosticStage") out[key] = String(raw || "").trim();
  }
  return Object.keys(out).length > 0 ? Object.freeze(out) : null;
}

function safeError(error) {
  const code = String(error?.message ?? "preview_login_failed");
  const diagnostic = safeDiagnostic(error?.diagnostic);

  if (code === "preview_identity_verification_failed") {
    return { status: 401, code: "invalid_credentials", diagnostic };
  }

  if (SAFE_LOGIN_ERROR_CODES.has(code)) {
    const defaultStatus = code === "invalid_credentials"
      ? 401
      : code === "too_many_login_attempts"
        ? 429
        : [
          "access_grant_not_found",
          "access_grant_ambiguous",
          "access_not_found",
          "active_access_grant_scope_mismatch",
          "preview_identity_binding_invalid",
          "preview_identity_product_not_supported",
          "preview_identity_binding_required",
          "preview_identity_binding_mismatch",
          "preview_product_not_allowed",
          "preview_login_product_mismatch",
          "preview_login_surface_not_allowed",
        ].includes(code)
          ? 403
          : CUSTOMER_PROVISIONING_CODES.includes(code)
            ? 409
            : 503;
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
      ? error.status
      : defaultStatus;
    return { status, code, diagnostic };
  }

  if (error?.status === 400) return { status: 400, code, diagnostic };
  if (error/.status === 401) return { status: 401, code: "invalid_credentials", diagnostic };
  if (error?.status === 403) return { status: 403, code, diagnostic };

  return { status: 503, code: "preview_login_unavailable", diagnostic };
}

function bootstrapLoginInput({ headers, payload }) {
  const input = {
    host: resolveSurfaceHost(headers),
    email: payload.email,
    password: payload.password,
  };
  if (payload.productId !== undefined) input.productId = payload.productId;
  return input;
}

function failurePayload(failure) {
  return {
    ok: false,
    authenticated: false,
    error: failure.code,
    ...(failure.diagnostic ? { diagnostic: failure.diagnostic } : {}),
  };
}

export function createUniCoPreviewLoginHttpApp({ app, bootstrap } = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest is required");

  if (typeof bootstrap?.login !== "function") {
    return Object.freeze({ enabled: false, app });
  }

  const wrapped = Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const pathname = new URL(String(request.url ?? "/"), "http://api-gateway.local").pathname;

      if (pathname === uniCoPreviewLoginHttpPath && method === "OPTIONS") {
        const cors = corsHeaders(request.headers);
        if (!cors["access-control-allow-origin"]) {
          return response(403, { ok: false, authenticated: false, error: "preview_login_origin_not_allowed" });
        }
        return emptyResponse(204, cors);
      }

      if (method !== "POST" || pathname !== uniCoPreviewLoginHttpPath) {
        return app.handleRequest(request);
      }

      const cors = corsHeaders(request.headers);
      try {
        const payload = parseJsonBody(request.body);
        const result = await bootstrap.login(bootstrapLoginInput({ headers: request.headers, payload }));

        return response(
          200,
          {
            ok: true,
            authenticated: true,
            productId: result.productId,
            agentId: result.agentId,
            workspaceId: result.workspaceId,
            accessGrantId: result.accessGrantId,
            expiresAt: result.expiresAt,
          },
          { ...cors, "set-cookie": result.setCookie },
        );
      } catch (error) {
        const failure = safeError(error);
        return response(failure.status, failurePayload(failure), cors);
      }
    },
  });

  return Object.freeze({ enabled: true, app: wrapped });
}
