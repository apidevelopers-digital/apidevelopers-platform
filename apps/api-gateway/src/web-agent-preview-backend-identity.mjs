const LOGIN_PATH = "/operator/v1/session/login";
const LOGOUT_PATH = "/operator/v1/session/logout";

const ACCESS_PATHS_BY_PRODUCT = Object.freeze({
  "product:uni-co": "/operator/v1/uni-co/preview/saas/access",
  "product:mitra": "/operator/v1/mitra/preview/saas/access",
});

const UNCLASSIFIED_ASSISTED_PROVISIONING = "preview_assisted_provisioning_response_unclassified";

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

function upstreamError(code, status = 503, diagnostic = null) {
  const error = new Error(code);
  error.status = status;
  if (diagnostic && typeof diagnostic === "object" && !Array.isArray(diagnostic)) {
    error.diagnostic = Object.freeze({ ...diagnostic, secretsExposed: false });
  }
  return error;
}

function resolveProductAccessPath(productId) {
  const product = text(productId) || "product:uni-co";
  const path = ACCESS_PATHS_BY_PRODUCT[product];
  if (!path) throw upstreamError("preview_identity_product_not_supported", 403);
  return Object.freeze({ productId: product, path });
}

function normalizeAccessBinding({ loginBody, normalizedEmail, accessBody, productId }) {
  const expectedProductId = text(productId) || "product:uni-co";
  const principalId = text(accessBody.principalId);
  const tenantId = text(accessBody.binding?.tenantId);
  const workspaceId = text(accessBody.binding?.workspaceId);
  const accessGrantId = text(accessBody.binding?.accessGrantId);
  const resolvedProductId = text(accessBody.binding?.productId);
  if (!principalId || !tenantId || !workspaceId || !accessGrantId || resolvedProductId !== expectedProductId) {
    throw upstreamError("preview_identity_binding_invalid", 403);
  }
  return Object.freeze({
    principalId,
    tenantId,
    name: text(loginBody?.operator?.email) || normalizedEmail,
    email: text(loginBody?.operator?.email).toLowerCase() || normalizedEmail,
    expectedBinding: Object.freeze({ workspaceId, accessGrantId, productId: resolvedProductId }),
  });
}

const SAFE_ASSISTED_PROVISIONING_ERRORS = new Set([
  "preview_assisted_provisioning_invalid",
  UNCLASSIFIED_ASSISTED_PROVISIONING,
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

function assistedProvisioningErrorFromBody(provisionBody) {
  const binding = provisionBody?.expectedBinding && typeof provisionBody.expectedBinding === "object" && !Array.isArray(provisionBody.expectedBinding)
    ? provisionBody.expectedBinding
    : provisionBody;
  const code = text(provisionBody?.reason || provisionBody?.error || provisionBody?.diagnosticStage);
  if (SAFE_ASSISTED_PROVISIONING_ERRORS.has(code)) return code;
  if (provisionBody?.ok !== true || provisionBody?.provisioned !== true) return "uni_co_provisioning_not_complete";
  if (provisionBody?.accountReady !== true) return "uni_co_customer_account_not_ready";
  if (!text(provisionBody?.tenantId)) return "uni_co_tenantId_required";
  if (!text(binding?.workspaceId)) return "uni_co_workspaceId_required";
  if (!text(provisionBody?.principalId)) return "uni_co_principalId_required";
  if (!text(binding?.accessGrantId)) return "uni_co_accessGrantId_required";
  return UNCLASSIFIED_ASSISTED_PROVISIONING;
}

function provisioningDiagnosticFromBody(provisionBody) {
  const body = provisionBody && typeof provisionBody === "object" && !Array.isArray(provisionBody) ? provisionBody : null;
  const binding = body?.expectedBinding && typeof body.expectedBinding === "object" && !Array.isArray(body.expectedBinding)
    ? body.expectedBinding
    : body;
  return Object.freeze({
    diagnosticStage: body ? assistedProvisioningErrorFromBody(body) : UNCLASSIFIED_ASSISTED_PROVISIONING,
    provisioningBodyPresent: Boolean(body),
    provisioningOk: body?.ok === true,
    provisioned: body?.provisioned === true,
    accountReady: body?.accountReady === true,
    productIdPresent: Boolean(text(binding?.productId)),
    tenantIdPresent: Boolean(text(body?.tenantId)),
    workspaceIdPresent: Boolean(text(binding?.workspaceId)),
    principalIdPresent: Boolean(text(body?.principalId)),
    accessGrantIdPresent: Boolean(text(binding?.accessGrantId)),
    reasonPresent: Boolean(text(body?.reason || body?.error)),
    diagnosticStagePresent: Boolean(text(body?.diagnosticStage)),
    expectedBindingPresent: Boolean(body?.expectedBinding && typeof body.expectedBinding === "object" && !Array.isArray(body.expectedBinding)),
    secretsExposed: false,
  });
}

function normalizeProvisionedBinding({ loginBody, normalizedEmail, provisionBody, productId }) {
  const expectedProductId = text(productId) || "product:uni-co";
  const binding = provisionBody?.expectedBinding && typeof provisionBody.expectedBinding === "object" && !Array.isArray(provisionBody.expectedBinding)
    ? provisionBody.expectedBinding
    : provisionBody;
  const principalId = text(provisionBody?.principalId);
  const tenantId = text(provisionBody?.tenantId);
  const workspaceId = text(binding?.workspaceId);
  const accessGrantId = text(binding?.accessGrantId);
  const resolvedProductId = text(binding?.productId);
  if (
    provisionBody?.ok !== true ||
    provisionBody?.provisioned !== true ||
    provisionBody?.accountReady !== true ||
    !principalId ||
    !tenantId ||
    !workspaceId ||
    !accessGrantId ||
    resolvedProductId !== expectedProductId
  ) {
    const diagnostic = provisioningDiagnosticFromBody(provisionBody);
    const code = resolvedProductId && resolvedProductId !== expectedProductId
      ? "uni_co_product_mismatch"
      : diagnostic.diagnosticStage;
    throw upstreamError(code, 409, { ...diagnostic, diagnosticStage: code });
  }
  return Object.freeze({
    principalId,
    tenantId,
    name: text(loginBody?.operator?.email) || normalizedEmail,
    email: text(loginBody?.operator?.email).toLowerCase() || normalizedEmail,
    expectedBinding: Object.freeze({ workspaceId, accessGrantId, productId: resolvedProductId }),
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
  if (base.protocol !== "https:") throw new TypeError("preview_identity_backend_https_required");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new TypeError("invalid timeoutMs");
  if (provisionAccess !== undefined && typeof provisionAccess !== "function") throw new TypeError("provisionAccess must be a function");

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(new URL(path, base), { redirect: "error", ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function requestAccess(sessionToken, productId) {
    const accessPath = resolveProductAccessPath(productId);
    const accessResponse = await request(accessPath.path, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${sessionToken}` },
    });
    const accessBody = await readJson(accessResponse);
    return Object.freeze({ response: accessResponse, body: accessBody, productId: accessPath.productId });
  }

  async function logout(sessionToken) {
    try {
      await request(LOGOUT_PATH, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${sessionToken}` },
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
    if (!normalizedEmail || !suppliedPassword) throw upstreamError("invalid_credentials", 401);

    const loginResponse = await request(LOGIN_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password: suppliedPassword }),
    });
    const loginBody = await readJson(loginResponse);
    if (loginResponse.status === 401 || loginResponse.status === 429) {
      throw upstreamError(loginResponse.status === 429 ? "too_many_login_attempts" : "invalid_credentials", loginResponse.status);
    }
    if (!loginResponse.ok) throw upstreamError("preview_identity_backend_unavailable", 503);

    const sessionToken = text(loginBody.sessionToken);
    if (!sessionToken) throw upstreamError("preview_identity_session_missing", 503);

    try {
      let { response: accessResponse, body: accessBody } = await requestAccess(sessionToken, requestedProduct);
      if (!accessResponse.ok || accessBody?.allowed !== true || !accessBody?.binding) {
        const code = text(accessBody?.error) || "access_grant_not_found";
        if (typeof provisionAccess === "function" && shouldAttemptAssistedProvisioning({ status: accessResponse.status, code })) {
          const provisionBody = await provisionAccess({
            email: normalizedEmail,
            productId: requestedProduct,
            loginBody,
            sessionToken,
            accessStatus: accessResponse.status,
            accessError: code,
          });
          if (provisionBody) {
            return normalizeProvisionedBinding({ loginBody, normalizedEmail, provisionBody, productId: requestedProduct });
          }
          ({ response: accessResponse, body: accessBody } = await requestAccess(sessionToken, requestedProduct));
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
