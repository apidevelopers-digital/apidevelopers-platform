import { createHash } from "node:crypto";
import { createSaasAccessComposition } from "./saas-access-composition.mjs";
import { createUniCoProvisioningApp } from "./saas-uni-co-provisioning.mjs";
import { createUniCoCustomerProvisioningApp } from "./saas-uni-co-customer-provisioning.mjs";
import { createUniCoPreviewBackendIdentityVerifier } from "./web-agent-preview-backend-identity.mjs";
import { createUniCoPreviewLoginHttpApp } from "./web-agent-preview-login-http.mjs";
import {
  createUniCoPreviewSaasAccessResolver,
  uniCoPreviewProductId,
  mitraPreviewProductId,
} from "./web-agent-preview-saas-access.mjs";
import {
  createUniCoPreviewBrowserSessionBootstrap,
  uniCoPreviewLoginHost,
  uniCoPreviewAgentId,
  mitraPreviewLoginHost,
  mitraPrimaryLoginHost,
  mitraPreviewAgentId,
} from "./web-agent-preview-session-bootstrap.mjs";

export const defaultPreviewLoginSurfaces = Object.freeze([
  Object.freeze({ host: uniCoPreviewLoginHost, productId: uniCoPreviewProductId, agentId: uniCoPreviewAgentId }),
  Object.freeze({ host: mitraPreviewLoginHost, productId: mitraPreviewProductId, agentId: mitraPreviewAgentId }),
  Object.freeze({ host: mitraPrimaryLoginHost, productId: mitraPreviewProductId, agentId: mitraPreviewAgentId }),
]);

const UNCLASSIFIED = "preview_assisted_provisioning_response_unclassified";
const SAFE_PROVISIONING_REASONS = new Set([
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
  UNCLASSIFIED,
]);

function primarySurface(loginSurfaces) {
  return Array.isArray(loginSurfaces) && loginSurfaces.length > 0 ? loginSurfaces[0] : defaultPreviewLoginSurfaces[0];
}

function text(value) {
  return String(value ?? "").trim();
}

function slug(value, fallback) {
  const out = text(value || fallback).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(out)) {
    throw new TypeError("preview assisted provisioning slug is invalid");
  }
  return out;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function readJsonBody(response) {
  try {
    return JSON.parse(String(response?.body ?? "{}"));
  } catch {
    return {};
  }
}

function createPreviewProvisioningActor() {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "server.uni-co-preview-login",
      name: "Uni.co Preview Login Assisted Provisioning",
      status: "active",
      scopes: Object.freeze(["saas:provision"]),
    }),
  });
}

function assistedProvisioningError(reason, status = 503) {
  const safeReason = text(reason);
  const code = SAFE_PROVISIONING_REASONS.has(safeReason) ? safeReason : UNCLASSIFIED;
  const error = new Error(code);
  error.status = [400, 401, 403, 409, 422, 503].includes(status) ? status : 503;
  return error;
}

function provisioningReasonForNormalizedBody({
  body,
  principalId,
  tenantId,
  workspaceId,
  accessGrantId,
  productId,
  requestedProductId,
}) {
  const explicit = text(body?.reason ?? body?.diagnosticStage);
  if (SAFE_PROVISIONING_REASONS.has(explicit)) return explicit;
  if (body?.ok !== true || body?.provisioned !== true) return "uni_co_provisioning_not_complete";
  if (productId !== requestedProductId) return "uni_co_product_mismatch";
  if (body?.accountReady !== true) return "uni_co_customer_account_not_ready";
  if (!tenantId) return "uni_co_tenantId_required";
  if (!workspaceId) return "uni_co_workspaceId_required";
  if (!principalId) return "uni_co_principalId_required";
  if (!accessGrantId) return "uni_co_accessGrantId_required";
  return UNCLASSIFIED;
}

function normalizeProvisionedAccess({ loginBody, normalizedEmail, body, expectedProductId }) {
  const principalId = text(body.principalId);
  const tenantId = text(body.tenantId);
  const workspaceId = text(body.workspaceId);
  const accessGrantId = text(body.accessGrantId);
  const productId = text(body.productId);
  const requestedProductId = text(expectedProductId) || uniCoPreviewProductId;

  if (
    body?.ok !== true ||
    body?.provisioned !== true ||
    body?.accountReady !== true ||
    !principalId ||
    !tenantId ||
    !workspaceId ||
    !accessGrantId ||
    productId !== requestedProductId
  ) {
    throw assistedProvisioningError(
      provisioningReasonForNormalizedBody({
        body,
        principalId,
        tenantId,
        workspaceId,
        accessGrantId,
        productId,
        requestedProductId,
      }),
      409,
    );
  }

  return Object.freeze({
    principalId,
    tenantId,
    name: text(loginBody?.operator?.email) || normalizedEmail,
    email: text(loginBody?.operator?.email).toLowerCase() || normalizedEmail,
    expectedBinding: Object.freeze({ workspaceId, accessGrantId, productId }),
  });
}

function createAssistedProvisionAccess({
  saasRuntime,
  saasAccess,
  membershipRuntime,
  federatedPrincipal,
  clock,
  tenantSlug,
  workspaceSlug,
  displayName,
} = {}) {
  const provisioningApp = createUniCoProvisioningApp({
    authenticator: Object.freeze({
      async authenticate() {
        return createPreviewProvisioningActor();
      },
    }),
    saasRuntime,
    saasAccess,
    federatedPrincipal,
    ...(clock ? { clock: () => clock().toISOString() } : {}),
  });
  const customerProvisioningApp = createUniCoCustomerProvisioningApp({
    provisioningApp,
    saasRuntime,
    saasAccess,
    membershipRuntime,
    ...(clock ? { clock: () => clock().toISOString() } : {}),
  });

  const effectiveTenantSlug = slug(tenantSlug, "institution-preview");
  const effectiveWorkspaceSlug = slug(workspaceSlug, "uni-co-main");
  const effectiveDisplayName = text(displayName) || "Institution Preview";

  return async function provisionAccess({ email, loginBody, productId } = {}) {
    const normalizedEmail = text(email).toLowerCase();
    const requestedProductId = text(productId) || uniCoPreviewProductId;
    if (!normalizedEmail) return null;

    const response = await customerProvisioningApp.handleRequest({
      method: "POST",
      url: "/v1/saas/uni-co/provision",
      body: JSON.stringify({
        tenantSlug: effectiveTenantSlug,
        workspaceSlug: effectiveWorkspaceSlug,
        displayName: effectiveDisplayName,
        productId: requestedProductId,
        subjectRef: sha256(normalizedEmail),
        idempotencyKey: `preview-bootstrap:${requestedProductId}:${effectiveTenantSlug}:${effectiveWorkspaceSlug}:${sha256(normalizedEmail)}`,
      }),
    });
    const body = readJsonBody(response);

    if (response.status < 200 || response.status >= 300) {
      throw assistedProvisioningError(body?.reason ?? body?.diagnosticStage ?? UNCLASSIFIED, response.status);
    }

    return normalizeProvisionedAccess({ loginBody, normalizedEmail, body, expectedProductId: requestedProductId });
  };
}

function bindingFromVerifiedIdentity({ identity, productId }) {
  const binding = identity?.expectedBinding;
  if (!binding || typeof binding !== "object") return null;
  if (text(binding.productId) !== productId) return null;

  const principalId = text(identity.principalId);
  const tenantId = text(identity.tenantId);
  const workspaceId = text(binding.workspaceId);
  const accessGrantId = text(binding.accessGrantId);

  if (!principalId || !tenantId || !workspaceId || !accessGrantId) return null;
  return Object.freeze({ principalId, tenantId, workspaceId, accessGrantId, productId });
}

export function createUniCoPreviewLoginComposition({
  app,
  store,
  verifyCredentials,
  identityBackendBaseUrl,
  identityFetchImpl,
  identityTimeoutMs,
  clock,
  generateSecret,
  sessionTtlSeconds,
  loginSurfaces = defaultPreviewLoginSurfaces,
  assistedProvisioning = true,
  assistedProvisioningTenantSlug,
  assistedProvisioningWorkspaceSlug,
  assistedProvisioningDisplayName,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest is required");
  }
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    throw new TypeError("store must provide read and transaction");
  }

  let effectiveVerifier = verifyCredentials;
  const identityBackendConfigured =
    typeof identityBackendBaseUrl === "string" && identityBackendBaseUrl.trim().length > 0;

  if (typeof effectiveVerifier !== "function" && !identityBackendConfigured) {
    return Object.freeze({
      enabled: false,
      app,
      descriptor: Object.freeze({
        enabled: false,
        mode: "preview-assisted",
        reason: "identity_verifier_unavailable",
      }),
    });
  }

  const { saasRuntime, saasAccess, membershipRuntime, federatedPrincipal } = createSaasAccessComposition({
    store,
    ...(clock ? { clock: () => clock().toISOString() } : {}),
  });

  const assistedProvisioningAccess =
    assistedProvisioning === true
      ? createAssistedProvisionAccess({
          saasRuntime,
          saasAccess,
          membershipRuntime,
          federatedPrincipal,
          clock,
          tenantSlug: assistedProvisioningTenantSlug,
          workspaceSlug: assistedProvisioningWorkspaceSlug,
          displayName: assistedProvisioningDisplayName,
        })
      : undefined;

  if (typeof effectiveVerifier !== "function" && identityBackendConfigured) {
    effectiveVerifier = createUniCoPreviewBackendIdentityVerifier({
      baseUrl: identityBackendBaseUrl,
      ...(identityFetchImpl ? { fetchImpl: identityFetchImpl } : {}),
      ...(identityTimeoutMs ? { timeoutMs: identityTimeoutMs } : {}),
      ...(assistedProvisioningAccess ? { provisionAccess: assistedProvisioningAccess } : {}),
    });
  }

  if (typeof effectiveVerifier !== "function") {
    return Object.freeze({
      enabled: false,
      app,
      descriptor: Object.freeze({
        enabled: false,
        mode: "preview-assisted",
        reason: "identity_verifier_unavailable",
      }),
    });
  }

  const baseResolveAccess = createUniCoPreviewSaasAccessResolver({
    accessRuntime: saasAccess,
    allowedProductIds: loginSurfaces.map((surface) => surface.productId),
  });

  const resolveAccess = async (input = {}) => {
    const fromIdentity = bindingFromVerifiedIdentity({
      identity: input.identity,
      productId: text(input.productId),
    });
    if (fromIdentity) return fromIdentity;
    return baseResolveAccess(input);
  };

  const bootstrap = createUniCoPreviewBrowserSessionBootstrap({
    store,
    verifyCredentials: effectiveVerifier,
    resolveAccess,
    loginSurfaces,
    ...(clock ? { clock } : {}),
    ...(generateSecret ? { generateSecret } : {}),
    ...(sessionTtlSeconds ? { sessionTtlSeconds } : {}),
  });
  const http = createUniCoPreviewLoginHttpApp({ app, bootstrap });
  const primary = primarySurface(loginSurfaces);

  return Object.freeze({
    enabled: true,
    app: http.app,
    bootstrap,
    saasAccess,
    descriptor: Object.freeze({
      enabled: true,
      mode: "preview-assisted",
      host: primary.host,
      productId: primary.productId,
      agentId: primary.agentId,
      products: Object.freeze(
        loginSurfaces.map((surface) =>
          Object.freeze({
            productId: surface.productId,
            host: surface.host,
            agentId: surface.agentId,
          }),
        ),
      ),
      identityBackendConfigured:
        typeof identityBackendBaseUrl === "string" && identityBackendBaseUrl.trim().length > 0,
      automaticProvisioning: assistedProvisioning === true,
      customerMembershipProvisioning: assistedProvisioning === true,
      provisionedBindingReuse: true,
      productScopedAssistedProvisioning: true,
      provisioningReasonPassthrough: true,
      classifiedProvisioningNormalizeFallback: true,
      unclassifiedProvisioningResponseDiagnostic: true,
      rawSessionSecretPersisted: false,
      transientOperatorSessionReturnedToBrowser: false,
    }),
  });
}
