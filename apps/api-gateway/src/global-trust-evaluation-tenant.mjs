import {
  createEntitlementId,
  createSubscriptionId,
  createTenantId,
  createWorkspaceId,
} from "@apidevelopers/contracts";
import { createDurableRepository } from "@apidevelopers/persistence-core";

const PRODUCT_ID = "trust";
const PLAN_ID = "evaluation";
const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const TRUST_EVALUATION_CAPABILITIES = Object.freeze([
  "trust-evaluate",
  "trust-audit-read",
  "trust-evidence-read",
]);

export const TRUST_EVALUATION_API_SCOPES = Object.freeze([
  "trust:evaluate",
  "trust:audit:read",
  "trust:evidence:read",
]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail("TRUST_EVALUATION_INVALID_INPUT", `${name} is required`);
  return normalized;
}

function normalizeSlug(value) {
  const slug = requireText(value, "slug").toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail("TRUST_EVALUATION_INVALID_SLUG", "slug must use lowercase letters, digits and hyphens");
  }
  return slug;
}

function normalizeTtlMs(value) {
  const ttlMs = value ?? DEFAULT_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < MIN_TTL_MS || ttlMs > MAX_TTL_MS) {
    fail("TRUST_EVALUATION_INVALID_TTL", "ttlMs must be an integer between 1 and 30 days");
  }
  return ttlMs;
}

function normalizeLimits(input = {}) {
  const requestsPerMinute = input.requestsPerMinute ?? 60;
  const maxAmountMinor = input.maxAmountMinor ?? 100_000;

  if (!Number.isSafeInteger(requestsPerMinute) || requestsPerMinute < 1 || requestsPerMinute > 600) {
    fail("TRUST_EVALUATION_INVALID_LIMIT", "requestsPerMinute must be between 1 and 600");
  }
  if (!Number.isSafeInteger(maxAmountMinor) || maxAmountMinor < 0 || maxAmountMinor > 10_000_000) {
    fail("TRUST_EVALUATION_INVALID_LIMIT", "maxAmountMinor must be between 0 and 10000000");
  }

  return Object.freeze({ requestsPerMinute, maxAmountMinor });
}

function requireService(value, methods, name) {
  if (!value || typeof value !== "object") {
    fail("TRUST_EVALUATION_INVALID_DEPENDENCY", `${name} is required`);
  }
  for (const method of methods) {
    if (typeof value[method] !== "function") {
      fail("TRUST_EVALUATION_INVALID_DEPENDENCY", `${name}.${method} must be a function`);
    }
  }
  return value;
}

function publicApiKey(record) {
  if (!record) return null;
  return Object.freeze({
    id: record.id,
    tenantId: record.tenantId,
    name: record.name,
    prefix: record.prefix,
    scopes: Object.freeze([...(record.scopes ?? [])]),
    status: record.status,
    createdAt: record.createdAt,
    revokedAt: record.revokedAt ?? null,
  });
}

function assertSaasBinding({ tenant, workspace, organizationId, tenantId }) {
  if (tenant && tenant.organizationId !== organizationId) {
    fail(
      "TRUST_EVALUATION_TENANT_CONFLICT",
      "existing tenant belongs to a different organization",
    );
  }
  if (
    workspace
    && (
      workspace.tenantId !== tenantId
      || workspace.productId !== PRODUCT_ID
    )
  ) {
    fail(
      "TRUST_EVALUATION_WORKSPACE_CONFLICT",
      "existing workspace does not belong to the Trust evaluation tenant",
    );
  }
}

export function createGlobalTrustEvaluationTenantService({
  store,
  saasRuntime,
  apiKeyLifecycle,
  clock = () => new Date().toISOString(),
} = {}) {
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    fail("TRUST_EVALUATION_INVALID_DEPENDENCY", "store must provide read and transaction");
  }

  const saas = requireService(
    saasRuntime,
    [
      "registerTenantWorkspace",
      "startSubscription",
      "grantEntitlement",
      "getTenant",
      "getWorkspace",
      "getSubscription",
      "getEntitlement",
    ],
    "saasRuntime",
  );

  const keys = requireService(
    apiKeyLifecycle,
    ["issueApiKey", "revokeApiKey", "listApiKeys"],
    "apiKeyLifecycle",
  );

  if (typeof clock !== "function") {
    fail("TRUST_EVALUATION_INVALID_DEPENDENCY", "clock must be a function");
  }

  const evaluations = createDurableRepository({
    store,
    collection: "trust.evaluations",
    idField: "tenantId",
  });

  async function getEvaluation(tenantId) {
    return evaluations.getById(requireText(tenantId, "tenantId"));
  }

  async function assertEvaluationActive(tenantId, at = clock()) {
    const evaluation = await getEvaluation(tenantId);
    if (!evaluation) {
      fail("TRUST_EVALUATION_NOT_FOUND", "evaluation tenant was not found");
    }
    if (evaluation.status !== "active") {
      fail("TRUST_EVALUATION_INACTIVE", `evaluation tenant is ${evaluation.status}`);
    }
    if (Date.parse(at) >= Date.parse(evaluation.expiresAt)) {
      fail("TRUST_EVALUATION_EXPIRED", "evaluation tenant has expired");
    }
    return evaluation;
  }

  async function ensureSaasObjects({
    tenantId,
    workspaceId,
    subscriptionId,
    slug,
    displayName,
    organizationId,
    createdAt,
  }) {
    let tenant = await saas.getTenant(tenantId);
    let workspace = await saas.getWorkspace(workspaceId);

    assertSaasBinding({ tenant, workspace, organizationId, tenantId });

    if (!tenant || !workspace) {
      const registered = await saas.registerTenantWorkspace({
        tenant: {
          tenantId,
          organizationId,
          slug,
          displayName,
          status: "active",
          createdAt,
        },
        workspace: {
          workspaceId,
          tenantId,
          productId: PRODUCT_ID,
          slug: "evaluation",
          displayName: `${displayName} · Trust Evaluation`,
          status: "active",
          createdAt,
        },
      });
      tenant = registered.tenant;
      workspace = registered.workspace;
    }

    assertSaasBinding({ tenant, workspace, organizationId, tenantId });

    let subscription = await saas.getSubscription(subscriptionId);
    if (!subscription) {
      subscription = await saas.startSubscription({
        subscriptionId,
        tenantId,
        productId: PRODUCT_ID,
        planId: PLAN_ID,
        status: "trial",
        currency: "BRL",
        monthlyAmount: 0,
        createdAt,
      });
    } else if (
      subscription.tenantId !== tenantId
      || subscription.productId !== PRODUCT_ID
      || subscription.planId !== PLAN_ID
    ) {
      fail(
        "TRUST_EVALUATION_SUBSCRIPTION_CONFLICT",
        "existing subscription does not belong to this Trust evaluation",
      );
    }

    const entitlements = [];
    for (const capability of TRUST_EVALUATION_CAPABILITIES) {
      const entitlementId = createEntitlementId(slug, "evaluation", capability);
      let entitlement = await saas.getEntitlement(entitlementId);

      if (!entitlement) {
        entitlement = await saas.grantEntitlement({
          entitlementId,
          subscriptionId,
          tenantId,
          workspaceId,
          productId: PRODUCT_ID,
          capability,
          status: "active",
          sourcePlanId: PLAN_ID,
          createdAt,
        });
      } else if (
        entitlement.subscriptionId !== subscriptionId
        || entitlement.tenantId !== tenantId
        || entitlement.workspaceId !== workspaceId
        || entitlement.productId !== PRODUCT_ID
        || entitlement.capability !== capability
      ) {
        fail(
          "TRUST_EVALUATION_ENTITLEMENT_CONFLICT",
          `existing entitlement conflicts with capability ${capability}`,
        );
      }

      entitlements.push(entitlement);
    }

    return Object.freeze({
      tenant,
      workspace,
      subscription,
      entitlements: Object.freeze(entitlements),
    });
  }

  async function createEvaluation({
    organizationId,
    slug: slugInput,
    displayName: displayNameInput,
    ttlMs: ttlInput,
    limits: limitsInput,
  } = {}) {
    const slug = normalizeSlug(slugInput);
    const organization = requireText(organizationId, "organizationId");
    const displayName = requireText(displayNameInput, "displayName");
    const ttlMs = normalizeTtlMs(ttlInput);
    const limits = normalizeLimits(limitsInput);

    const createdAt = clock();
    if (Number.isNaN(Date.parse(createdAt))) {
      fail("TRUST_EVALUATION_INVALID_CLOCK", "clock must return an ISO-8601 date");
    }

    const tenantId = createTenantId(slug);
    const workspaceId = createWorkspaceId(slug, "evaluation");
    const subscriptionId = createSubscriptionId(slug, PRODUCT_ID);

    const existing = await evaluations.getById(tenantId);
    if (existing) {
      const currentKeys = await keys.listApiKeys(tenantId);
      const record = currentKeys.find((item) => item.id === existing.apiKeyId) ?? null;

      return Object.freeze({
        created: false,
        evaluation: existing,
        apiKey: publicApiKey(record),
        secret: null,
        secretIssued: false,
      });
    }

    await ensureSaasObjects({
      tenantId,
      workspaceId,
      subscriptionId,
      slug,
      displayName,
      organizationId: organization,
      createdAt,
    });

    const currentKeys = await keys.listApiKeys(tenantId);
    const dangling = currentKeys.find(
      (item) => item.status === "active" && item.name === "Trust Evaluation",
    );
    if (dangling) {
      fail(
        "TRUST_EVALUATION_KEY_RECOVERY_REQUIRED",
        "active Trust Evaluation API key exists without an evaluation record",
      );
    }

    const issued = await keys.issueApiKey({
      tenantId,
      name: "Trust Evaluation",
      scopes: TRUST_EVALUATION_API_SCOPES,
    });

    const expiresAt = new Date(Date.parse(createdAt) + ttlMs).toISOString();
    const evaluation = Object.freeze({
      tenantId,
      organizationId: organization,
      workspaceId,
      subscriptionId,
      productId: PRODUCT_ID,
      planId: PLAN_ID,
      slug,
      displayName,
      status: "active",
      environment: "sandbox",
      createdAt,
      expiresAt,
      apiKeyId: issued.apiKey.id,
      apiKeyPrefix: issued.apiKey.prefix,
      capabilities: Object.freeze([...TRUST_EVALUATION_CAPABILITIES]),
      scopes: Object.freeze([...TRUST_EVALUATION_API_SCOPES]),
      limits,
      controls: Object.freeze({
        financialEgress: "blocked",
        realMoney: false,
        biometricMaterialAccepted: false,
      }),
    });

    try {
      await evaluations.create(evaluation);
    } catch (error) {
      try {
        await keys.revokeApiKey({
          tenantId,
          apiKeyId: issued.apiKey.id,
          reason: "evaluation_record_create_failed",
        });
      } catch {
        // Do not mask the original persistence failure.
      }
      throw error;
    }

    return Object.freeze({
      created: true,
      evaluation,
      apiKey: publicApiKey(issued.apiKey),
      secret: issued.secret,
      secretIssued: true,
    });
  }

  async function expireEvaluation({
    tenantId,
    reason = "evaluation_expired",
    at = clock(),
  } = {}) {
    const id = requireText(tenantId, "tenantId");
    const current = await evaluations.getById(id);
    if (!current) {
      fail("TRUST_EVALUATION_NOT_FOUND", "evaluation tenant was not found");
    }
    if (current.status === "expired") return current;

    await keys.revokeApiKey({
      tenantId: id,
      apiKeyId: current.apiKeyId,
      reason,
    });

    const expired = Object.freeze({
      ...current,
      status: "expired",
      expiredAt: at,
      expirationReason: requireText(reason, "reason"),
    });

    await evaluations.replace(expired);
    return expired;
  }

  return Object.freeze({
    createEvaluation,
    getEvaluation,
    assertEvaluationActive,
    expireEvaluation,
  });
}
