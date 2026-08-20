const LOGIN_PATH = "/operator/v1/session/login";
const ACCESS_PATH = "/operator/v1/uni-co/preview/saas/access";
const LOGOUT_PATH = "/operator/v1/session/logout";

function text(value) {
  return String(value ?? "").trim();
}

async function readJson(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function upstreamError(code, status = 503) {
  const error = new Error(code);
  error.status = status;
  return error;
}

export function createUniCoPreviewBackendIdentityVerifier({
  baseUrl,
  fetchImpl = fetch,
  timeoutMs = 8000,
} = {}) {
  const base = new URL(text(baseUrl));
  if (base.protocol !== "https:") {
    throw new TypeError("preview_identity_backend_https_required");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new TypeError("invalid timeoutMs");
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(new URL(path, base), {
        redirect: "error",
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return async function verifyCredentials({ email, password } = {}) {
    const normalizedEmail = text(email).toLowerCase();
    const suppliedPassword = String(password ?? "");
    if (!normalizedEmail || !suppliedPassword) {
      throw upstreamError("invalid_credentials", 401);
    }

    const loginResponse = await request(LOGIN_PATH, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        email: normalizedEmail,
        password: suppliedPassword,
      }),
    });
    const loginBody = await readJson(loginResponse);

    if (loginResponse.status === 401 || loginResponse.status === 429) {
      throw upstreamError(
        loginResponse.status === 429 ? "too_many_login_attempts" : "invalid_credentials",
        loginResponse.status,
      );
    }
    if (!loginResponse.ok) {
      throw upstreamError("preview_identity_backend_unavailable", 503);
    }

    const sessionToken = text(loginBody.sessionToken);
    if (!sessionToken) {
      throw upstreamError("preview_identity_session_missing", 503);
    }

    try {
      const accessResponse = await request(ACCESS_PATH, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${sessionToken}`,
        },
      });
      const accessBody = await readJson(accessResponse);

      if (!accessResponse.ok || accessBody?.allowed !== true || !accessBody?.binding) {
        const code = text(accessBody?.error) || "access_grant_not_found";
        throw upstreamError(code, accessResponse.status >= 400 ? accessResponse.status : 403);
      }

      const principalId = text(accessBody.principalId);
      const tenantId = text(accessBody.binding.tenantId);
      const workspaceId = text(accessBody.binding.workspaceId);
      const accessGrantId = text(accessBody.binding.accessGrantId);
      const productId = text(accessBody.binding.productId);

      if (
        !principalId ||
        !tenantId ||
        !workspaceId ||
        !accessGrantId ||
        productId !== "product:uni-co"
      ) {
        throw upstreamError("preview_identity_binding_invalid", 403);
      }

      return Object.freeze({
        principalId,
        tenantId,
        name: text(loginBody?.operator?.email) || normalizedEmail,
        email: text(loginBody?.operator?.email).toLowerCase() || normalizedEmail,
        expectedBinding: Object.freeze({
          workspaceId,
          accessGrantId,
          productId,
        }),
      });
    } finally {
      try {
        await request(LOGOUT_PATH, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            authorization: `Bearer ${sessionToken}`,
          },
          body: "{}",
        });
      } catch {
        // The operator token remains short-lived and is never returned to the browser.
      }
    }
  };
}
