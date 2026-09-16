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
const REASON_UNMAPPED = "preview_assisted_provisioning_reason_unmapped";
const SAFE_REASON_PATTERN = /^[a-z][a-z0-9_]{2,96}$/;
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
  REASON_UNMAPPED,
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

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function bindingBody(body) {
  const objectBody = safeObject(body);
  const expectedBinding = safeObject(objectBody?.expectedBinding);
  return expectedBinding ?? objectBody;
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
function assistedProvisioningError(reason, status = 503, diagnostic = null) {
  const safeReason = text(reason);
  const code = SAFE_PROVISIONING_REASONS.has(safeReason) ? safeReason : UNCLASSIFIED;
  const error = new Error(code);
  error.status = [400, 401, 403, 409, 422, 503].includes(status) ? status : 503;
  if (diagnostic && typeof diagnostic === "object" && !Array.isArray(diagnostic)) {
    error.diagnostic = Object.freeze({ ...diagnostic, diagnosticStage: code, secretsExposed: false });
  }
  return error;
}
function provisioningReasonMetadata(body, fallbackReason = UNCLASSIFIED) {
  const objectBody = safeObject(body);
  const rawReason = text(objectBody?.reason ?? objectBody?.error ?? objectBody?.diagnosticStage);
  const fallback = text(fallbackReason) || UNCLASSIFIED;
  const reasonSafePattern = Boolean(rawReason && SAFE_REASON_PATTERN.test(rawReason));
  const reasonMapped = Boolean(rawReason && SAFE_PROVISIONING_REASONS.has(rawReason));
  const diagnosticStage = reasonMapped ? rawReason : rawReason ? REASON_UNMAPPED : fallback;
  return Object.freeze({ objectBody, rawReason, reasonSafePattern, reasonMapped, diagnosticStage });
}
function provisioningDiagnosticFromBody(body, reason = UNCLASSIFIED) {
  const { objectBody, rawReason, reasonSafePattern, reasonMapped, diagnosticStage } =
    provisioningReasonMetadata(body, reason);
  const binding = bindingBody(body);
  return Object.freeze({
    diagnosticStage,
    provisioningBodyPresent: Boolean(objectBody),
    provisioningOk: objectBody?.ok === true,
    provisioned: objectBody?.provisioned === true,
    accountReady: objectBody?.accountReady === true,
    productIdPresent: Boolean(text(binding?.productId ?? objectBody?.productId)),
    tenantIdPresent: Boolean(text(objectBody?.tenantId)),
    workspaceIdPresent: Boolean(text(binding?.workspaceId ?? objectBody?.workspaceId)),
    principalIdPresent: Boolean(text(objectBody?.principalId)),
    accessGrantIdPresent: Boolean(text(binding?.accessGrantId ?? objectBody?.accessGrantId)),
    reasonPresent: Boolean(rawReason),
    reasonMapped,
    reasonSafePattern,
    diagnosticStagePresent: Boolean(text(objectBody?.diagnosticStage)),
    expectedBindingPresent: Boolean(safeObject(objectBody?.expectedBinding)),
    secretsExposed: false,
  });
}
function provisioningReasonForNormalizedBody({
  body,
  principalId,
  tenantId,
  workspaceId,
  accessGrantId,
  productId,
  requestedProductId,
  bindingComplete,
  wrapperComplete,
}) {
  const explicit = provisioningReasonMetadata(body).diagnosticStage;
  if (SAFE_PROVISIONING_REASONS.has(explicit)) return explicit;
  if (productId !== requestedProductId) return "uni_co_product_mismatch";
  if (!tenantId) return "uni_co_tenantId_required";
  if (!workspaceId) return "uni_co_workspaceId_required";
  if (!principalId) return "uni_co_principalId_required";
  if (!accessGrantId) return "uni_co_accessGrantId_required";
  if (!bindingComplete || !wrapperComplete) return "uni_co_provisioning_not_complete";
  return UNCLASSIFIED;
}
function normalizeProvisionedAccess({ loginBody, normalizedEmail, body, expectedProductId }) {
  const binding = bindingBody(body);
  const principalId = text(body?.principalId);
  const tenantId = text(body?.tenantId);
  const workspaceId = text(binding?.workspaceId ?? body?.workspaceId);
  const accessGrantId = text(binding?.accessGrantId ?? body?.accessGrantId);
  const productId = text(binding?.productId ?? body?.productId);
  const requestedProductId = text(expectedProductId) || uniCoPreviewProductId;
  const expectedBindingPresent = Boolean(safeObject(safeObject(body)?.expectedBinding));
  const bindingComplete = Boolean(
    principalId &&
      tenantId &&
      workspaceId &&
      accessGrantId &&
      productId === requestedProductId,
  );
  const wrapperComplete = body?.ok === true && body?.provisioned === true && body?.accountReady === true;
  if (!bindingComplete || (!wrapperComplete && !expectedBindingPresent)) {
    const reason = provisioningReasonForNormalizedBody({
      body,
      principalId,
      tenantId,
      workspaceId,
      accessGrantId,
      productId,
      requestedProductId,
      bindingComplete,
      wrapperComplete,
    });
    throw assistedProvisioningError(reason, 409, provisioningDiagnosticFromBody(body, reason));
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
      const reason = provisioningReasonMetadata(body).diagnosticStage;
      throw assistedProvisioningError(reason, response.status, provisioningDiagnosticFromBody(body, reason));
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
      expectedBindingProvisioningShape: true,
      acceptedExpectedBindingWithoutWrapperFlags: true,
      rawSessionSecretPersisted: false,
      transientOperatorSessionReturnedToBrowser: false,
    }),
  });
}
