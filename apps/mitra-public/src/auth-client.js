export class MitraAuthClientError extends Error {
  constructor(code, message, status = 0, details = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = sanitizeErrorDetails(details);
  }
}

function sanitizeErrorDetails(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const allowed = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!/^(diagnosticStage|provisioning[A-Z][A-Za-z0-9]*|accountReady|productIdPresent|tenantIdPresent|workspaceIdPresent|principalIdPresent|accessGrantIdPresent|reasonPresent|diagnosticStagePresent|secretsExposed)$/.test(key)) {
      continue;
    }
    if (typeof raw === "boolean") allowed[key] = raw;
    else if (key === "diagnosticStage") allowed[key] = String(raw || "").trim();
  }
  return Object.keys(allowed).length > 0 ? Object.freeze(allowed) : null;
}

function cleanBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new MitraAuthClientError("invalid_auth_base_url", "Endpoint de autenticação inválido.");
  }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) {
    throw new MitraAuthClientError("insecure_auth_base_url", "A autenticação da Mitra exige HTTPS.");
  }
  return url.toString().replace(/\/+$/, "");
}

function cleanPath(value) {
  const path = String(value || "/v1/web-agent/session/login").trim();
  return path.startsWith("/") ? path : `/${path}`;
}

function resolveSurfaceHost(hostname) {
  const explicit = String(hostname || "").trim().toLowerCase();
  if (explicit) return explicit;
  if (typeof window !== "undefined" && window.location?.host) {
    return String(window.location.host).trim().toLowerCase();
  }
  return "mitra-preview.apidevelopers.digital";
}

function safeLoginFailureDetails(data) {
  return sanitizeErrorDetails({
    ...(sanitizeErrorDetails(data?.diagnostic) || {}),
    diagnosticStage: data?.diagnosticStage,
    secretsExposed: data?.secretsExposed,
  });
}

export function createMitraAuthClient({
  baseUrl = "",
  loginPath = "/v1/web-agent/session/login",
  fetchImpl = globalThis.fetch,
  surfaceHost,
} = {}) {
  const root = cleanBaseUrl(baseUrl);
  const path = cleanPath(loginPath);
  const host = resolveSurfaceHost(surfaceHost);

  async function login({ email, password } = {}) {
    if (!root) {
      throw new MitraAuthClientError(
        "auth_not_configured",
        "Login real ainda não configurado para este ambiente.",
        503,
      );
    }
    if (typeof fetchImpl !== "function") {
      throw new MitraAuthClientError("fetch_unavailable", "Cliente HTTP indisponível.", 503);
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPassword = String(password || "");
    if (!normalizedEmail || !normalizedPassword) {
      throw new MitraAuthClientError("credentials_required", "Informe e-mail e senha.", 400);
    }

    const response = await fetchImpl(`${root}${path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-apidevelopers-surface-host": host,
      },
      body: JSON.stringify({ email: normalizedEmail, password: normalizedPassword, productId: "product:mitra" }),
      credentials: "include",
      cache: "no-store",
      redirect: "error",
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok || data?.ok !== true || data?.authenticated !== true) {
      throw new MitraAuthClientError(
        data?.error || "login_failed",
        data?.message || "Não foi possível autenticar na Mitra Professional.",
        response.status,
        safeLoginFailureDetails(data),
      );
    }

    if (data.productId && data.productId !== "product:mitra") {
      throw new MitraAuthClientError(
        "product_binding_mismatch",
        "A sessão recebida não pertence ao Mitra Professional.",
        403,
      );
    }

    return Object.freeze({
      authenticated: true,
      productId: data.productId || "product:mitra",
      workspaceId: data.workspaceId || null,
      accessGrantId: data.accessGrantId || null,
      expiresAt: data.expiresAt || null,
    });
  }

  return Object.freeze({
    configured: Boolean(root),
    baseUrl: root,
    loginPath: path,
    surfaceHost: host,
    login,
  });
}
