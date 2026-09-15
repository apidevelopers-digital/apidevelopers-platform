const LOGIN_PATH = "/operator/v1/session/login";
const LOGOUT_PATH = "/operator/v1/session/logout";

const ACCESS_PATHS_BY_PRODUCT = Object.freeze({
  "product:uni-co": "/operator/v1/uni-co/preview/saas/access",
  "product:mitra": "/operator/v1/mitra/preview/saas/access",
});

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

function resolveProductAccessPath(productId) {
  const product = text(productId) || "product:uni-co";
  const path = ACCESS_PATHS_BY_PRODUCT[product];
  if (!path) {
    throw upstreamError("preview_identity_product_not_supported", 403);
  }
  return Object.freeze({ productId: product, path });
}

function normalizeAccessBinding({ loginBody, normalizedEmail, accessBody, productId }) {
  const expectedProductId = text(productId) || "product:uni-co";
  const principalId = text(accessBody.principalId);
  const tenantId = text(accessBody.binding?.tenantId);
  const workspaceId = text(accessBody.binding?.workspaceId);
  const accessGrantId = text(accessBody.binding?.accessGrantId);
  const resolvedProductId = text(accessBody.binding?.productId);

  if (
    !principalId ||
    !tenantId ||
    !workspaceId ||
    !accessGrantId ||
    resolvedProductId !== expectedProductId
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
      productId: resolvedProductId,
    }),
  });
}

function normalizeProvisionedBinding({ loginBody, normalizedEmail, provisionBody, productId }) {
  const expectedProductId = text(productId) || "product:uni-co";
  const principalId = text(provisionBody.principalId);
  const tenantId = text(provisionBody.tenantId);
  const workspaceId = text(provisionBody.workspaceId);
  const accessGrantId = text(provisionBody.accessGrantId);
  const resolvedProductId = text(provisionBody.productId);

  if (
    provisionBody?.ok !== true ||
    provisionBody?.provisioned !== true ||
    !principalId ||
    !tenantId ||
    !workspaceId ||
    !accessGrantId ||
    resolvedProductId !== expectedProductId
  ) {
    throw upstreamError("preview_assisted_provisioning_invalid", 503);
  }

  return Object.freeze({
    principalId,
    tenantId,
    name: text(loginBody?.operator?.email) || normalizedEmail,
    email: text(loginBody?.operator?.email).toLowerCase() || normalizedEmail,
    expectedBinding: Object.freeze({
      workspaceId,
      accessGrantId,
      productId: resolvedProductId,
    }),
  });
}

function shouldAttemptAssistedProvisioning({ status, code }) {
  if (![401, 403, 404, 409, 503].includes(status)) return false;
  return [
    "access_grant_not_found",
    "access_not_found",
    "uni_account_access_not_found",
    "uni_account_access_unavailable",
    "preview_identity_binding_invalid",
  ].includes(code) || status === 403 || status === 404;
}

export function createUniCoPreviewBackendIdentityVerifier({
  baseUrl,
  fetchImpl = fetch,
  timeoutMs = 8000,
  provisionAccess,
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
  if (provisionAccess !== undefined && typeof provisionAccess !== "function") {
    throw new TypeError("provisionAccess must be a function");
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

  async function requestAccess(sessionToken, productId) {
    const accessPath = resolveProductAccessPath(productId);
    const accessResponse = await request(accessPath.path, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${sessionToken}`,
      },
    });
    const accessBody = await readJson(accessResponse);
    return Object.freeze({ response: accessResponse, body: accessBody, productId: accessPath.productId });
  }

  async function logout(sessionToken) {
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

  async function verifyCredentials({ email, password, productId } = {}) {
    const normalizedEmail = text(email).toLowerCase();
    const suppliedPassword = String(password ?? "");
    const requestedProduct = resolveProductAccessPath(productId).productId;
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
      let { response: accessResponse, body: accessBody } = await requestAccess(sessionToken, requestedProduct);

      if (!accessResponse.ok || accessBody?.allowed !== true || !accessBody?.binding) {
        const code = text(accessBody?.error) || "access_grant_not_found";
        if (
          typeof provisionAccess === "function" &&
          shouldAttemptAssistedProvisioning({ status: accessResponse.status, code })
        ) {
          const provisionBody = await provisionAccess({
            email: normalizedEmail,
            productId: requestedProduct,
            loginBody,
            sessionToken,
            accessStatus: accessResponse.status,
            accessError: code,
          });
          if (!provisionBody) {
            throw upstreamError("preview_assisted_provisioning_invalid", 503);
          }
          return normalizeProvisionedBinding({ loginBody, normalizedEmail, provisionBody, productId: requestedProduct });
        }
      }

      if (!accessResponse.ok || accessBody?.allowed !== true || !accessBody?.binding) {
        const code = text(accessBody?.error) || "access_grant_not_found";
        throw upstreamError(code, accessResponse.status >= 400 ? accessResponse.status : 403);
      }
      return normalizeAccessBinding({ loginBody, normalizedEmail, accessBody, productId: requestedProduct });
    } finally {
      await logout(sessionToken);
    }
  }

  verifyCredentials.productScoped = true;
  return verifyCredentials;
}
