const SUBJECT_REF_PATTERN = /^[a-f0-9]{64}$/;
const BOOTSTRAP_PATH = "/v1/saas/uni-co/provision";
const TENANT_SLUG = "apidevelopers-digital";
const WORKSPACE_SLUG = "uni-co-preview";
const DISPLAY_NAME = "API Developers.digital Preview";
const IDEMPOTENCY_KEY = "uni-co-preview-bootstrap-v1";

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function parseEnabled(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "false") return false;
  if (normalized === "true") return true;
  throw new TypeError("UNI_CO_PREVIEW_BOOTSTRAP_ENABLED must be true or false");
}

function safeBody(response) {
  try {
    return typeof response?.body === "string" ? JSON.parse(response.body) : response?.body;
  } catch {
    return null;
  }
}

export function resolveUniCoPreviewBootstrapConfig(env = process.env) {
  const enabled = parseEnabled(env.UNI_CO_PREVIEW_BOOTSTRAP_ENABLED);
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      mode: "disabled",
      automaticLoginProvisioning: false,
    });
  }

  const provisioningKey = optionalText(env.API_GATEWAY_PROVISIONING_KEY);
  if (!provisioningKey) {
    throw new TypeError("API_GATEWAY_PROVISIONING_KEY is required when uni.co preview bootstrap is enabled");
  }

  const subjectRef = optionalText(env.UNI_CO_PREVIEW_BOOTSTRAP_SUBJECT_REF)?.toLowerCase();
  if (!subjectRef || !SUBJECT_REF_PATTERN.test(subjectRef)) {
    throw new TypeError("UNI_CO_PREVIEW_BOOTSTRAP_SUBJECT_REF must be a 64-character lowercase SHA-256 hex value");
  }

  return Object.freeze({
    enabled: true,
    mode: "explicit-one-shot",
    path: BOOTSTRAP_PATH,
    tenantSlug: TENANT_SLUG,
    workspaceSlug: WORKSPACE_SLUG,
    displayName: DISPLAY_NAME,
    idempotencyKey: IDEMPOTENCY_KEY,
    subjectRef,
    provisioningKey,
    automaticLoginProvisioning: false,
  });
}

export async function runUniCoPreviewBootstrap({
  app,
  env = process.env,
  logger = consol,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }

  const config = resolveUniCoPreviewBootstrapConfig(env);
  if (!config.enabled) {
    return Object.freeze({
      executed: false,
      mode: config.mode,
      automaticLoginProvisioning: false,
    });
  }

  const response = await app.handleRequest({method: "POST", url: config.path, headers: { authorization: `Bearer ${config.provisioningKey}`, "content-type": "application/json" }, body: { tenantSlug: config.tenantSlug,  workspaceSlug: config.workspaceSlug, displayName: config.displayName, subjectRef: config.subjectRef, idempotencyKey: config.idempotencyKey } });

  const body = safeBody(response);
  if (response?.status !== 201 || body?.ok !== true || body?.status !== "active") {
    throw new Error(`uni_co_preview_bootstrap_failed:${response?.status ?? "unknown"}:${body?.reason ?? "unknown"}`);
  }

  const result = Object.freeze({
    executed: true,
    mode: config.mode,
    tenantId: body.tenantId,
    workspaceId: body.workspaceId,
    principalId: body.principalId,
    accessGrantId: body.accessGrantId,
    productId: body.productId,
    status: body.status,
    secretsExposed: false,
    automaticLoginProvisioning: false,
  });

  if (typeof logger?.log === "function") {
    logger.log(JSON.stringify({
      event: "uni_co_preview_bootstrap_completed",
      mode: result.mode,
      tenantId: result.tenantId,
      workspaceId: result.workspaceId,
      principalId: result.principalId,
      accessGrantId: result.accessGrantId,
      productId: result.productId,
      status: result.status,
      secretsExposed: false,
      automaticLoginProvisioning: false,
    }));
  }

  return result;
}

export const uniCoPreviewBootstrapContract = Object.freeze({
  path: BOOTSTRAP_PATH,
  tenantSlug: TENANT_SLUG,
  workspaceSlug: WORKSPACE_SLUG,
  displayName: DISPLAY_NAME,
  idempotencyKey: IDEMPOTENCY_KEY,
  enabledEnv: "UNI_CO_PREVIEW_BOOTSTRAP_ENABLED",
  subjectRefEnv: "UNI_CO_PREVIEW_BOOTSTRAP_SUBJECT_REF",
  provisioningKeyEnv: "API_GATEWAY_PROVISIONING_KEY",
  automaticLoginProvisioning: false,
});
